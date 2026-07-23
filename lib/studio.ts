// Content Studio job orchestration: create + validate jobs, and drive the
// state machine from the worker tick (queued → generating → done/failed).
// Composite templates render locally with ffmpeg; ai-ugc generates through
// Creatify (stock personas) or fal.ai (custom persona image), then optionally
// concats a CTA clip.
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery, patchRecord, now } from "./db";
import { DomainError } from "./posts";
import { importFromFile, readMediaBytes, type MediaRow } from "./media";
import {
  assertFfmpeg,
  compositeImageOverlay,
  concatClips,
  normalizeSlideImage,
  probe,
  renderFadeIn,
  renderGrid,
  renderPlaceholder,
} from "./ffmpeg";
import { createLipsync, getLipsync, MOCK_OUTPUT_URL, type ProviderJobState } from "./creatify";
import { falEnabled, falUploadBytes, FAL_AVATAR_PER_SECOND, pollAvatarJob, submitAvatarJob } from "./fal";
import { STUDIO_AI_MONTHLY_CAP } from "./entitlements";

export const STUDIO_TEMPLATES = ["grid-2x2", "fade-in", "ai-ugc", "slideshow"] as const;
export type StudioTemplate = (typeof STUDIO_TEMPLATES)[number];

export type StudioJobRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  template: StudioTemplate;
  status: "queued" | "generating" | "compositing" | "done" | "failed";
  params: string;
  provider: "creatify" | "fal" | null;
  provider_job_id: string | null;
  provider_video_url: string | null;
  output_media_id: string | null;
  output_media_ids: string | null;
  error_message: string | null;
  attempts: number;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
};

export type StudioParams = {
  media_ids?: string[];
  caption?: string;
  caption_media_id?: string;
  persona?: { source: "stock" | "custom"; id?: string; image_media_id?: string; name?: string };
  script?: string;
  cta_media_id?: string;
  aspect_ratio?: string;
  // Slide text is rasterized to a PNG client-side (same idiom as caption_media_id
  // below — slim ffmpeg builds have no drawtext/freetype), so the server only
  // ever sees an already-rendered overlay image, never raw text.
  slides?: { image_media_id: string; caption_media_id?: string }[];
  source_explore_item_id?: string;
};

export const SCRIPT_MAX = 600; // also bounds per-generation provider cost
export const CAPTION_MAX = 200;
const SLIDE_MIN = 1;
const SLIDE_MAX = 10;

/**
 * Pay-as-you-go price transparency for the wizard. Speech averages ~15 chars/s,
 * so estimated video seconds ≈ script length / 15 (clamped 5–60s).
 */
export function estimateAiUgcCost(scriptChars: number, source: "stock" | "custom") {
  const seconds = Math.min(60, Math.max(5, Math.round(scriptChars / 15)));
  return {
    seconds,
    fal_usd: Math.round(seconds * FAL_AVATAR_PER_SECOND * 100) / 100,
    creatify_credits: Math.max(5, Math.ceil(seconds / 30) * 5), // 5 credits / 30s
  };
}

async function uploadedKinds(ids: string[]): Promise<Map<string, string>> {
  const rows = await convexQuery<{ id: string; kind: string }[]>(api.media.getUploadedKinds, { ids });
  return new Map(rows.map((r) => [r.id, r.kind]));
}

const monthStartIso = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
};

export async function aiUsageThisMonth(workspaceId: string): Promise<{ used: number; cap: number }> {
  const used = await convexQuery<number>(api.studioJobs.countMonthlySince, {
    workspace_id: workspaceId,
    template: "ai-ugc",
    since: monthStartIso(),
  });
  return { used, cap: STUDIO_AI_MONTHLY_CAP };
}

export async function createStudioJob(
  userId: string,
  workspaceId: string,
  input: { template?: string } & StudioParams
): Promise<StudioJobRow> {
  const template = input.template as StudioTemplate;
  if (!STUDIO_TEMPLATES.includes(template)) {
    throw new DomainError(400, "Unknown template.");
  }

  const params: StudioParams = { aspect_ratio: "9:16" };

  if (template === "grid-2x2" || template === "fade-in") {
    const ids = Array.isArray(input.media_ids) ? input.media_ids.map(String) : [];
    const need = template === "grid-2x2" ? 4 : 1;
    if (ids.length !== need) {
      throw new DomainError(400, `This template needs exactly ${need} video clip${need > 1 ? "s" : ""}.`);
    }
    const kinds = await uploadedKinds(ids);
    if (ids.some((id) => kinds.get(id) !== "video")) {
      throw new DomainError(400, "All clips must be uploaded videos.");
    }
    params.media_ids = ids;
    if (template === "fade-in") {
      const caption = String(input.caption ?? "").trim();
      if (caption.length > CAPTION_MAX) {
        throw new DomainError(400, `Caption exceeds ${CAPTION_MAX} characters.`);
      }
      params.caption = caption;
      if (input.caption_media_id) {
        const capKinds = await uploadedKinds([String(input.caption_media_id)]);
        if (capKinds.get(String(input.caption_media_id)) !== "image") {
          throw new DomainError(400, "Caption overlay must be an uploaded image.");
        }
        params.caption_media_id = String(input.caption_media_id);
      }
    }
  } else if (template === "slideshow") {
    const slides = Array.isArray(input.slides) ? input.slides : [];
    if (slides.length < SLIDE_MIN || slides.length > SLIDE_MAX) {
      throw new DomainError(400, `Pick between ${SLIDE_MIN} and ${SLIDE_MAX} slides.`);
    }
    const imageIds = slides.map((s) => String(s.image_media_id));
    const captionIds = slides.map((s) => s.caption_media_id).filter(Boolean).map(String);
    const kinds = await uploadedKinds([...imageIds, ...captionIds]);
    if (imageIds.some((id) => kinds.get(id) !== "image")) {
      throw new DomainError(400, "Every slide needs an uploaded image.");
    }
    if (captionIds.some((id) => kinds.get(id) !== "image")) {
      throw new DomainError(400, "A slide's caption overlay failed to upload — try again.");
    }
    params.slides = slides.map((s) => ({
      image_media_id: String(s.image_media_id),
      caption_media_id: s.caption_media_id ? String(s.caption_media_id) : undefined,
    }));
    if (input.source_explore_item_id) {
      params.source_explore_item_id = String(input.source_explore_item_id);
    }
  } else {
    // ai-ugc
    const script = String(input.script ?? "").trim();
    if (!script) throw new DomainError(400, "A script is required.");
    if (script.length > SCRIPT_MAX) {
      throw new DomainError(400, `Script exceeds ${SCRIPT_MAX} characters.`);
    }
    const persona = input.persona;
    if (persona?.source === "stock") {
      if (!persona.id) throw new DomainError(400, "Pick a persona.");
      params.persona = { source: "stock", id: String(persona.id), name: persona.name ? String(persona.name) : undefined };
    } else if (persona?.source === "custom") {
      const imageId = String(persona.image_media_id ?? "");
      const kinds = await uploadedKinds(imageId ? [imageId] : []);
      if (kinds.get(imageId) !== "image") {
        throw new DomainError(400, "Upload a persona image first.");
      }
      params.persona = { source: "custom", image_media_id: imageId };
    } else {
      throw new DomainError(400, "Pick a persona.");
    }
    if (input.cta_media_id) {
      const kinds = await uploadedKinds([String(input.cta_media_id)]);
      if (kinds.get(String(input.cta_media_id)) !== "video") {
        throw new DomainError(400, "The CTA clip must be an uploaded video.");
      }
      params.cta_media_id = String(input.cta_media_id);
    }
    params.script = script;
    const { used, cap } = await aiUsageThisMonth(workspaceId);
    if (used >= cap) {
      throw new DomainError(
        403,
        `You've used all ${cap} AI generations for this month.`,
        "studio_limit"
      );
    }
  }

  return await convexMutation<StudioJobRow>(api.studioJobs.createJob, {
    id: `sjob_${randomBytes(8).toString("hex")}`,
    workspace_id: workspaceId,
    created_by: userId,
    template,
    params: JSON.stringify(params),
  });
}

export async function listStudioJobs(workspaceId: string): Promise<StudioJobRow[]> {
  return await convexQuery<StudioJobRow[]>(api.studioJobs.listForWorkspace, {
    workspace_id: workspaceId,
  });
}

export async function getStudioJob(id: string): Promise<StudioJobRow | null> {
  return await convexQuery<StudioJobRow | null>(api.studioJobs.getById, { id });
}

const patchJob = (id: string, patch: Record<string, unknown>) =>
  convexMutation<StudioJobRow | null>(api.studioJobs.patchJob, { id, patch });

const MAX_POLL_ATTEMPTS = 5;

/** Worker tick entry: claim runnable jobs and advance each one step. */
export async function processStudioJobs(): Promise<number> {
  const jobs = await convexMutation<StudioJobRow[]>(api.studioJobs.claimRunnable, {
    now: now(),
    limit: 3,
  });
  let advanced = 0;
  for (const job of jobs) {
    try {
      await advanceJob(job);
      advanced++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Render failed.";
      // Transient provider-poll errors get retried; everything else is fatal.
      if (job.status === "generating" && job.attempts + 1 < MAX_POLL_ATTEMPTS) {
        await patchJob(job.id, { attempts: job.attempts + 1, lease_until: null });
      } else {
        await patchJob(job.id, { status: "failed", error_message: message, lease_until: null });
        console.error(`[studio] job ${job.id} failed:`, message);
      }
    }
  }
  return advanced;
}

async function advanceJob(job: StudioJobRow): Promise<void> {
  const params = JSON.parse(job.params) as StudioParams;
  if (job.template === "ai-ugc") {
    // compositing here means the worker died after the provider finished —
    // re-polling the provider is idempotent, so restart from there.
    if (job.status === "queued") await submitGeneration(job, params);
    else await checkGeneration(job, params);
  } else if (job.template === "slideshow") {
    await renderSlideshow(job, params);
  } else {
    await renderComposite(job, params);
  }
}

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pt-studio-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function fetchMediaTo(dir: string, mediaId: string, name: string): Promise<string> {
  const file = await readMediaBytes(mediaId);
  if (!file) throw new Error("A source clip is missing from storage.");
  const p = path.join(dir, name);
  writeFileSync(p, file.bytes);
  return p;
}

async function renderComposite(job: StudioJobRow, params: StudioParams): Promise<void> {
  await assertFfmpeg();
  if (job.status === "queued") await patchJob(job.id, { status: "compositing" });
  await withTmpDir(async (dir) => {
    const ids = params.media_ids ?? [];
    const inputs = await Promise.all(ids.map((id, i) => fetchMediaTo(dir, id, `in-${i}.mp4`)));
    const out = path.join(dir, "out.mp4");
    if (job.template === "grid-2x2") {
      await renderGrid(inputs as [string, string, string, string], out);
    } else {
      const captionPng = params.caption_media_id
        ? await fetchMediaTo(dir, params.caption_media_id, "caption.png")
        : undefined;
      await renderFadeIn(inputs[0], out, captionPng);
    }
    await finishJob(job, out);
  });
}

async function submitGeneration(job: StudioJobRow, params: StudioParams): Promise<void> {
  const persona = params.persona!;
  let provider: "creatify" | "fal";
  let jobId: string;
  if (persona.source === "stock") {
    provider = "creatify";
    ({ jobId } = await createLipsync({
      personaId: persona.id!,
      script: params.script!,
      aspectRatio: params.aspect_ratio ?? "9:16",
    }));
  } else {
    provider = "fal";
    let imageUrl = "mock:image";
    if (falEnabled()) {
      const image = await readMediaBytes(persona.image_media_id!);
      if (!image) throw new Error("Persona image is missing from storage.");
      imageUrl = await falUploadBytes(image.bytes, image.row.mime_type, image.row.name);
    }
    ({ jobId } = await submitAvatarJob({ imageUrl, script: params.script! }));
  }
  await patchJob(job.id, {
    status: "generating",
    provider,
    provider_job_id: jobId,
    lease_until: null,
  });
}

async function checkGeneration(job: StudioJobRow, params: StudioParams): Promise<void> {
  const state: ProviderJobState =
    job.provider === "fal"
      ? await pollAvatarJob(job.provider_job_id!)
      : await getLipsync(job.provider_job_id!);

  if (state.status === "running") {
    await patchJob(job.id, { lease_until: null });
    return;
  }
  if (state.status === "failed") {
    await patchJob(job.id, {
      status: "failed",
      error_message: state.error ?? "Generation failed.",
      lease_until: null,
    });
    return;
  }

  await patchJob(job.id, { status: "compositing", provider_video_url: state.outputUrl ?? null });
  await assertFfmpeg();
  await withTmpDir(async (dir) => {
    const generated = path.join(dir, "generated.mp4");
    if (state.outputUrl === MOCK_OUTPUT_URL) {
      await renderPlaceholder(generated);
    } else {
      const res = await fetch(state.outputUrl!);
      if (!res.ok) throw new Error(`Could not download generated video (${res.status}).`);
      writeFileSync(generated, Buffer.from(await res.arrayBuffer()));
    }
    let out = generated;
    if (params.cta_media_id) {
      const cta = await fetchMediaTo(dir, params.cta_media_id, "cta.mp4");
      out = path.join(dir, "final.mp4");
      await concatClips([generated, cta], out);
    }
    await finishJob(job, out);
  });
}

async function finishJob(job: StudioJobRow, filePath: string): Promise<void> {
  const name = `${job.template}-${job.created_at.slice(0, 10)}-${job.id.slice(-6)}.mp4`;
  const row: MediaRow = await importFromFile(job.workspace_id, filePath, name, "video/mp4");
  const meta = await probe(filePath);
  await patchRecord("media", row.id, {
    duration_s: meta.duration_s,
    width: meta.width,
    height: meta.height,
  });
  await patchJob(job.id, {
    status: "done",
    output_media_id: row.id,
    error_message: null,
    lease_until: null,
  });
}

/** Composites each slide's uploaded photo with its (optional) rasterized text overlay. */
async function renderSlideshow(job: StudioJobRow, params: StudioParams): Promise<void> {
  await assertFfmpeg();
  if (job.status === "queued") await patchJob(job.id, { status: "compositing" });
  const slides = params.slides ?? [];
  await withTmpDir(async (dir) => {
    const outputs: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const base = await fetchMediaTo(dir, slide.image_media_id, `slide-${i}-base.jpg`);
      const out = path.join(dir, `slide-${i}-out.jpg`);
      if (slide.caption_media_id) {
        const overlay = await fetchMediaTo(dir, slide.caption_media_id, `slide-${i}-caption.png`);
        await compositeImageOverlay(base, overlay, out);
      } else {
        await normalizeSlideImage(base, out);
      }
      outputs.push(out);
    }
    await finishSlideshowJob(job, outputs);
  });
}

async function finishSlideshowJob(job: StudioJobRow, filePaths: string[]): Promise<void> {
  const ids: string[] = [];
  for (let i = 0; i < filePaths.length; i++) {
    const name = `${job.template}-${job.created_at.slice(0, 10)}-${job.id.slice(-6)}-${i + 1}.jpg`;
    const row: MediaRow = await importFromFile(job.workspace_id, filePaths[i], name, "image/jpeg");
    ids.push(row.id);
  }
  await patchJob(job.id, {
    status: "done",
    output_media_ids: JSON.stringify(ids),
    error_message: null,
    lease_until: null,
  });
}
