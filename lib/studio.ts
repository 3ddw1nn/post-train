// Content Studio job orchestration: create + validate jobs, and drive the
// state machine from the worker tick (queued → generating → done/failed).
// Composite templates render locally with ffmpeg; ai-ugc generates through
// Replicate P-Video Avatar (stock personas or a custom persona image), then optionally
// concats a CTA clip.
import { ConvexError } from "convex/values";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery, patchRecord, now } from "./db";
import { DomainError } from "./posts";
import { importFromFile, markMediaFinished, readMediaBytes, type MediaRow } from "./media";
import {
  assertFfmpeg,
  compositeImageOverlay,
  concatClips,
  normalizeSlideImage,
  probe,
  renderSequence,
  renderGrid,
  type GridOptions,
  renderPlaceholder,
} from "./ffmpeg";
import { MOCK_OUTPUT_URL, studioMock, type ProviderJobState } from "./creatify";
import { DEFAULT_VOICE, imageDataUri, pollAvatarJob, replicateEnabled, stockPersonaImage, submitAvatarJob, VOICES } from "./replicate-avatar";
import { creditsForSeconds, studioAiMonthlyCredits } from "./entitlements";
import { getSubscription } from "./billing";
import { VIDEO_PRESETS, normalizeVideoFps, videoAspectById, videoPresetById } from "./video-render-settings";
import { DEFAULT_TRANSITION_DURATION, DEFAULT_TRANSITION_ID, clampTransitionDuration, isTransitionId } from "./transitions";

export const STUDIO_TEMPLATES = ["grid-2x2", "fade-in", "ai-ugc", "slideshow"] as const;
export type StudioTemplate = (typeof STUDIO_TEMPLATES)[number];

export type StudioJobRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  notification_group_id?: string;
  template: StudioTemplate;
  status: "queued" | "generating" | "compositing" | "done" | "failed";
  params: string;
  provider: "replicate" | "creatify" | "fal" | null;
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
  /** Destination used for a friendly exported-media filename. */
  output_platform_id?: string;
  /** Groups per-destination jobs from one Render click into one notification. */
  render_batch_id?: string;
  media_ids?: string[];
  caption?: string;
  caption_media_id?: string;
  persona?: { source: "stock" | "custom"; id?: string; image_media_id?: string; name?: string };
  script?: string;
  voice?: string;
  /** Titles the Library card when an ai-ugc render auto-files itself (see finishJob). */
  campaign_name?: string;
  cta_media_id?: string;
  video_preset_id?: string;
  aspect_ratio?: string;
  fps?: number;
  // Slide text is rasterized to a PNG client-side (same idiom as caption_media_id
  // below — slim ffmpeg builds have no drawtext/freetype), so the server only
  // ever sees an already-rendered overlay image, never raw text.
  slides?: { image_media_id: string; caption_media_id?: string }[];
  source_explore_item_id?: string;
  // grid-2x2 only: which clips' audio to mix together (0-3) plus an optional
  // uploaded track, and optional colored separators between the four quadrants.
  grid_audio?: { clips?: number[]; track_media_id?: string };
  grid_border?: { width: number; color: string; opacity: number };
  // Focal point for each clip's crop (0-1 per axis, 0.5 = centered), set via
  // the double-click reposition modal in the editor.
  grid_crop?: { x: number; y: number }[];
  // grid-2x2 only: trims the composed timeline as a whole (all four clips
  // stay in sync), not any one quadrant. end_s omitted/0 means "through the
  // natural shortest-clip end".
  grid_trim?: { start_s?: number; end_s?: number };
  // Video Editor Studio: clips may be split into source slices, then joined by
  // per-seam transitions (a hard cut or any xfade in lib/transitions.ts).
  // fade_transitions[i] is the seam *before* segment i — index 0 is the
  // opening (fade in from black instead of a preceding clip). fade_closing is
  // the symmetric fade-to-black at the tail. fade_transition/_duration are the
  // older whole-sequence form, still accepted as the per-seam fallback so
  // in-flight jobs and older clients keep rendering.
  fade_segments?: { media_id: string; start_s?: number; end_s?: number; gap_before_s?: number; volume?: number; crop?: { x: number; y: number } }[];
  fade_transitions?: { type: string; duration: number }[];
  fade_transition?: string;
  fade_transition_duration?: number;
  fade_closing?: { type: string; duration: number };
  // Every audio clip mixed into the render — the uploaded soundtrack and any
  // clip audio the user detached from its video are the same shape, each
  // independently trimmed and positioned in the composed output timeline.
  fade_audio_clips?: { media_id: string; source_start_s: number; source_end_s: number; start_s: number; volume: number }[];
  // Video Editor Studio's Captions timeline: timed, positioned text overlays,
  // baked into the export (unlike `caption` below, which is post text only).
  // Each is a client-rasterized transparent PNG (same idiom as slides[].caption_media_id
  // above) plus its placement/timing — see buildFilterGraph's per-caption overlay.
  fade_captions?: { media_id: string; start_s: number; end_s: number; x: number; y: number; width: number }[];
  // Timed image/GIF/sticker layers positioned above the composed sequence.
  fade_visual_layers?: { media_id: string; start_s: number; end_s: number; row: number; x: number; y: number; width: number; chroma?: { enabled: boolean; color: string; similarity: number; blend: number } }[];
};

export const SCRIPT_MAX = 600; // also bounds per-generation provider cost
export const CAPTION_MAX = 200;
const SLIDE_MIN = 1;
const SLIDE_MAX = 10;

/**
 * Rendered length of a script. Speech averages ~15 chars/s, clamped 5–60s.
 * Mirrored client-side by estimateSeconds in components/studio.tsx and
 * components/ai-ugc-studio.tsx — keep the three in step.
 */
export function estimateAiUgcSeconds(scriptChars: number): number {
  return Math.min(60, Math.max(5, Math.round(scriptChars / 15)));
}

/**
 * Credits this script will cost to render. Charging per render instead would
 * price a 5s clip and a 600-char script the same despite an 8x cost gap, which
 * rewards writing max-length scripts. Conversion lives in lib/entitlements.ts
 * so the wizard prices a render identically before submitting it.
 */
export function creditsForScript(scriptChars: number): number {
  return creditsForSeconds(estimateAiUgcSeconds(scriptChars));
}

async function uploadedKinds(ids: string[]): Promise<Map<string, string>> {
  const rows = await convexQuery<{ id: string; kind: string }[]>(api.media.getUploadedKinds, { ids });
  return new Map(rows.map((r) => [r.id, r.kind]));
}

const monthStartIso = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
};

/**
 * AI UGC credits used and included this month, in credits (not renders).
 *
 * Scoped to whoever owns the workspace, not the workspace itself: the plan is
 * sold per subscriber, but ownedWorkspaceCap lets Pro hold 6 workspaces, so a
 * per-workspace quota handed out 6x what was priced. Every workspace the owner
 * holds draws on one shared pool.
 */
export type AiUsage = {
  /** Allowance credits consumed this month. */
  used: number;
  /** Allowance included with the plan. */
  cap: number;
  /** Purchased top-up credits still banked; spent only after the allowance. */
  purchased: number;
};

export async function aiUsageThisMonth(workspaceId: string): Promise<AiUsage> {
  const workspace = await convexQuery<{ owner_id: string } | null>(api.workspaces.getById, { id: workspaceId });
  if (!workspace) return { used: 0, cap: 0, purchased: 0 };
  const subscription = await getSubscription(workspace.owner_id);
  const cap = studioAiMonthlyCredits(subscription);
  // One query resolves the owner's workspaces, their allowance usage, and
  // their purchased balance — all inside Convex, so the numbers can't be
  // stitched together from separate snapshots.
  const balance = await convexQuery<{ allowance_used: number; purchased: number }>(
    api.credits.balanceForOwner,
    { owner_id: workspace.owner_id, allowance: cap, since: monthStartIso() },
  );
  return { used: balance.allowance_used, cap, purchased: balance.purchased };
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
  // Metered templates set these; the ffmpeg-only ones cost us nothing per run.
  let jobCredits: number | undefined;
  let creditOwnerId: string | undefined;
  let creditAllowance: number | undefined;
  if (typeof input.output_platform_id === "string") {
    params.output_platform_id = input.output_platform_id.slice(0, 64);
  }

  if (template === "grid-2x2" || template === "fade-in") {
    const ids = Array.isArray(input.media_ids) ? input.media_ids.map(String) : [];
    const need = template === "grid-2x2" ? 4 : 1;
    if (template === "fade-in" ? ids.length < 1 || ids.length > 8 : ids.length !== need) {
      throw new DomainError(400, template === "fade-in" ? "Add between 1 and 8 video segments." : `This template needs exactly ${need} video clips.`);
    }
    const kinds = await uploadedKinds(ids);
    if (ids.some((id) => kinds.get(id) !== "video")) {
      throw new DomainError(400, "All clips must be uploaded videos.");
    }
    params.media_ids = ids;
    if (template === "grid-2x2") {
      const preset = videoPresetById(input.video_preset_id);
      const aspect = preset?.aspect ?? videoAspectById(input.aspect_ratio) ?? VIDEO_PRESETS[0].aspect;
      if (preset) params.video_preset_id = preset.id;
      params.aspect_ratio = aspect.id;
      params.fps = normalizeVideoFps(input.fps);
      const ga = input.grid_audio;
      if (ga) {
        const audio: { clips?: number[]; track_media_id?: string } = {};
        if (Array.isArray(ga.clips)) {
          audio.clips = [...new Set(ga.clips.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 3);
        }
        if (ga.track_media_id) {
          const audioId = String(ga.track_media_id);
          const kind = (await uploadedKinds([audioId])).get(audioId);
          // A video's audio is fine too, but the picker only offers audio uploads.
          if (kind !== "audio" && kind !== "video") {
            throw new DomainError(400, "Upload an audio file for the soundtrack.");
          }
          audio.track_media_id = audioId;
        }
        if (audio.clips || audio.track_media_id) params.grid_audio = audio;
      }
      const gb = input.grid_border;
      if (gb && Number(gb.width) > 0) {
        const width = Math.min(40, Math.max(1, Math.round(Number(gb.width))));
        const color = /^#[0-9a-fA-F]{6}$/.test(String(gb.color)) ? String(gb.color) : "#ffffff";
        const opacity = Math.min(1, Math.max(0, Number(gb.opacity)));
        params.grid_border = { width, color, opacity };
      }
      if (Array.isArray(input.grid_crop) && input.grid_crop.length === 4) {
        const clamp01 = (n: unknown) => (Number.isFinite(Number(n)) ? Math.min(1, Math.max(0, Number(n))) : 0.5);
        params.grid_crop = input.grid_crop.map((o) => ({ x: clamp01(o?.x), y: clamp01(o?.y) }));
      }
      const gt = input.grid_trim;
      if (gt) {
        const start = Number.isFinite(Number(gt.start_s)) ? Math.max(0, Number(gt.start_s)) : 0;
        const end = Number.isFinite(Number(gt.end_s)) ? Math.max(0, Number(gt.end_s)) : 0;
        if (start > 0 || end > start) params.grid_trim = { start_s: start, end_s: end > start ? end : undefined };
      }
    }
    if (template === "fade-in") {
      const preset = videoPresetById(input.video_preset_id);
      const aspect = preset?.aspect ?? videoAspectById(input.aspect_ratio) ?? VIDEO_PRESETS[0].aspect;
      if (preset) params.video_preset_id = preset.id;
      params.aspect_ratio = aspect.id;
      const requestedSegments = Array.isArray(input.fade_segments) ? input.fade_segments : [];
      if (requestedSegments.length > 0) {
        if (requestedSegments.length !== ids.length || requestedSegments.some((segment, index) => String(segment?.media_id) !== ids[index])) {
          throw new DomainError(400, "The video timeline does not match its source clips.");
        }
        params.fade_segments = requestedSegments.map((segment) => ({
          media_id: String(segment.media_id),
          start_s: Number.isFinite(Number(segment.start_s)) ? Math.max(0, Number(segment.start_s)) : undefined,
          end_s: Number.isFinite(Number(segment.end_s)) ? Math.max(0, Number(segment.end_s)) : undefined,
          gap_before_s: Number.isFinite(Number(segment.gap_before_s)) ? Math.min(60, Math.max(0, Number(segment.gap_before_s))) : 0,
          volume: Number.isFinite(Number(segment.volume)) ? Math.min(2, Math.max(0, Number(segment.volume))) : 1,
          crop: {
            x: Number.isFinite(Number(segment.crop?.x)) ? Math.min(1, Math.max(0, Number(segment.crop?.x))) : 0.5,
            y: Number.isFinite(Number(segment.crop?.y)) ? Math.min(1, Math.max(0, Number(segment.crop?.y))) : 0.5,
          },
        }));
      }
      params.fade_transition = isTransitionId(input.fade_transition) ? String(input.fade_transition) : DEFAULT_TRANSITION_ID;
      params.fade_transition_duration = clampTransitionDuration(input.fade_transition_duration ?? DEFAULT_TRANSITION_DURATION);
      // One seam per clip boundary, plus index 0 for the opening (fade in
      // from black instead of a preceding clip). Normalized to the clip count
      // so a short or long array can never leave a boundary reading someone
      // else's transition.
      params.fade_transitions = ids.map((_, index) => {
        const seam = Array.isArray(input.fade_transitions) ? input.fade_transitions[index] : undefined;
        return {
          type: isTransitionId(seam?.type) ? String(seam!.type) : params.fade_transition!,
          duration: clampTransitionDuration(seam?.duration ?? params.fade_transition_duration),
        };
      });
      // Unlike interior seams, the closing fade defaults to "cut" (no effect)
      // rather than falling back to the shared default transition — nothing
      // should start fading to black unless the user explicitly adds it.
      params.fade_closing = {
        type: isTransitionId(input.fade_closing?.type) ? String(input.fade_closing!.type) : "cut",
        duration: clampTransitionDuration(input.fade_closing?.duration ?? DEFAULT_TRANSITION_DURATION),
      };
      const requestedAudioClips = Array.isArray(input.fade_audio_clips) ? input.fade_audio_clips : [];
      if (requestedAudioClips.length > 0) {
        const audioIds = requestedAudioClips.map((c) => String(c.media_id));
        const audioKinds = await uploadedKinds(audioIds);
        if (audioIds.some((id) => { const kind = audioKinds.get(id); return kind !== "audio" && kind !== "video"; })) {
          throw new DomainError(400, "Every audio clip needs an uploaded audio or video file.");
        }
        params.fade_audio_clips = requestedAudioClips.map((c) => ({
          media_id: String(c.media_id),
          source_start_s: Number.isFinite(Number(c.source_start_s)) ? Math.max(0, Number(c.source_start_s)) : 0,
          source_end_s: Number.isFinite(Number(c.source_end_s)) ? Math.max(0, Number(c.source_end_s)) : 0,
          start_s: Number.isFinite(Number(c.start_s)) ? Math.max(0, Number(c.start_s)) : 0,
          volume: Number.isFinite(Number(c.volume)) ? Math.min(2, Math.max(0, Number(c.volume))) : 1,
        }));
      }
      const requestedCaptions = Array.isArray(input.fade_captions) ? input.fade_captions : [];
      if (requestedCaptions.length > 0) {
        const captionIds = requestedCaptions.map((c) => String(c.media_id));
        const captionKinds = await uploadedKinds(captionIds);
        if (captionIds.some((id) => captionKinds.get(id) !== "image")) {
          throw new DomainError(400, "Every caption needs a rendered overlay image.");
        }
        params.fade_captions = requestedCaptions.map((c) => ({
          media_id: String(c.media_id),
          start_s: Number.isFinite(Number(c.start_s)) ? Math.max(0, Number(c.start_s)) : 0,
          end_s: Number.isFinite(Number(c.end_s)) ? Math.max(0, Number(c.end_s)) : 0,
          x: Number.isFinite(Number(c.x)) ? Math.min(100, Math.max(0, Number(c.x))) : 50,
          y: Number.isFinite(Number(c.y)) ? Math.min(100, Math.max(0, Number(c.y))) : 50,
          width: Number.isFinite(Number(c.width)) ? Math.min(100, Math.max(5, Number(c.width))) : 64,
        }));
      }
      const requestedVisualLayers = Array.isArray(input.fade_visual_layers) ? input.fade_visual_layers : [];
      if (requestedVisualLayers.length > 0) {
        const visualIds = requestedVisualLayers.map((layer) => String(layer.media_id));
        const visualKinds = await uploadedKinds(visualIds);
        if (visualIds.some((id) => { const kind = visualKinds.get(id); return kind !== "image" && kind !== "video"; })) {
          throw new DomainError(400, "Every visual layer needs an uploaded image, GIF, or video.");
        }
        params.fade_visual_layers = requestedVisualLayers.map((layer) => ({
          media_id: String(layer.media_id),
          start_s: Number.isFinite(Number(layer.start_s)) ? Math.max(0, Number(layer.start_s)) : 0,
          end_s: Number.isFinite(Number(layer.end_s)) ? Math.max(0, Number(layer.end_s)) : 0,
          row: Number.isFinite(Number(layer.row)) ? Math.max(0, Math.round(Number(layer.row))) : 0,
          x: Number.isFinite(Number(layer.x)) ? Math.min(100, Math.max(0, Number(layer.x))) : 50,
          y: Number.isFinite(Number(layer.y)) ? Math.min(100, Math.max(0, Number(layer.y))) : 50,
          width: Number.isFinite(Number(layer.width)) ? Math.min(100, Math.max(5, Number(layer.width))) : 45,
          ...(layer.chroma?.enabled ? { chroma: {
            enabled: true,
            color: /^#[0-9a-fA-F]{6}$/.test(String(layer.chroma.color)) ? String(layer.chroma.color) : "#00ff00",
            similarity: Number.isFinite(Number(layer.chroma.similarity)) ? Math.min(1, Math.max(0.01, Number(layer.chroma.similarity))) : 0.3,
            blend: Number.isFinite(Number(layer.chroma.blend)) ? Math.min(1, Math.max(0, Number(layer.chroma.blend))) : 0.08,
          } } : {}),
        }));
      }
      // Pure post text — never baked into the video (matches grid-2x2's
      // platformCaptions, which never touches the render either).
      const caption = String(input.caption ?? "").trim();
      if (caption.length > CAPTION_MAX) {
        throw new DomainError(400, `Caption exceeds ${CAPTION_MAX} characters.`);
      }
      params.caption = caption;
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
    if (!replicateEnabled() && !studioMock()) {
      throw new DomainError(503, "AI UGC is not configured yet. Add REPLICATE_API_TOKEN to enable video generation.");
    }
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
    params.voice = VOICES.includes(input.voice as (typeof VOICES)[number]) ? input.voice : DEFAULT_VOICE;
    // Same 160-char clamp app/api/app/studio/finish/route.ts applies.
    params.campaign_name = String(input.campaign_name ?? "").trim().slice(0, 160);
    // Charged on length, so a 40s script costs 8x a 5s one instead of both
    // spending "one render" of a flat quota. Affordability is NOT checked here
    // — createJob does it inside the same transaction as the insert, so two
    // concurrent renders can't both pass a check before either is recorded.
    jobCredits = creditsForScript(script.length);
    const workspace = await convexQuery<{ owner_id: string } | null>(api.workspaces.getById, { id: workspaceId });
    creditOwnerId = workspace?.owner_id;
    creditAllowance = studioAiMonthlyCredits(await getSubscription(workspace?.owner_id ?? ""));
  }

  const id = `sjob_${randomBytes(8).toString("hex")}`;
  const notificationGroupId = typeof input.render_batch_id === "string" && input.render_batch_id.trim()
    ? input.render_batch_id.slice(0, 100)
    : id;
  try {
    return await convexMutation<StudioJobRow>(api.studioJobs.createJob, {
      id,
      workspace_id: workspaceId,
      created_by: userId,
      notification_group_id: notificationGroupId,
      template,
      params: JSON.stringify(params),
      ...(jobCredits === undefined
        ? {}
        : {
            credits: jobCredits,
            owner_id: creditOwnerId,
            allowance: creditAllowance,
            period_start: monthStartIso(),
          }),
    });
  } catch (e) {
    throw asStudioLimitError(e);
  }
}

/**
 * createJob rejects an unaffordable render from inside its transaction, as a
 * ConvexError carrying the shortfall. Translate it into the DomainError shape
 * the API layer already speaks, so the client sees a `studio_limit` code and
 * can offer credits instead of a generic 500.
 */
function asStudioLimitError(e: unknown): unknown {
  const data = e instanceof ConvexError ? (e.data as Record<string, unknown> | undefined) : undefined;
  if (!data || data.code !== "studio_limit") return e;
  const needed = Number(data.needed ?? 0);
  const available = Number(data.allowance_left ?? 0) + Number(data.purchased ?? 0);
  return new DomainError(
    403,
    available === 0
      ? `You're out of AI credits. Buy a top-up or upgrade your plan to keep generating.`
      : `This video needs ${needed} AI credits and you have ${available} left. Shorten the script, buy a top-up, or upgrade your plan.`,
    "studio_limit",
  );
}

export async function listStudioJobs(workspaceId: string): Promise<StudioJobRow[]> {
  return await convexQuery<StudioJobRow[]>(api.studioJobs.listForWorkspace, {
    workspace_id: workspaceId,
  });
}

export async function getStudioJob(id: string): Promise<StudioJobRow | null> {
  return await convexQuery<StudioJobRow | null>(api.studioJobs.getById, { id });
}

/** Removes a render from the Content Studio history for this workspace.
 * Output/source media remain in the media library and any existing posts are
 * untouched, so this is safe even after a video has been used elsewhere. */
export async function deleteStudioJob(id: string, workspaceId: string): Promise<boolean> {
  return await convexMutation<boolean>(api.studioJobs.deleteForWorkspace, { id, workspace_id: workspaceId });
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
      // Transient network errors get retried whether they happen submitting
      // the job ("queued") or polling it ("generating") — a one-off "fetch
      // failed" talking to the provider shouldn't permanently kill a render
      // that a retry a few seconds later would have submitted fine.
      if ((job.status === "queued" || job.status === "generating") && job.attempts + 1 < MAX_POLL_ATTEMPTS) {
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
  let file: Awaited<ReturnType<typeof readMediaBytes>>;
  try {
    file = await readMediaBytes(mediaId);
  } catch {
    throw new Error("We couldn’t retrieve one of the source videos. Check your connection and try rendering again.");
  }
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
      const opts: GridOptions = {};
      const aspect = videoAspectById(params.aspect_ratio) ?? videoAspectById("9:16")!;
      opts.width = aspect.width;
      opts.height = aspect.height;
      opts.fps = normalizeVideoFps(params.fps);
      const ga = params.grid_audio;
      opts.audioClips = ga?.clips ?? [0]; // default to the top-left clip's audio
      if (ga?.track_media_id) opts.audioPath = await fetchMediaTo(dir, ga.track_media_id, "audio-track");
      if (params.grid_border) opts.border = params.grid_border;
      if (params.grid_crop?.length === 4) {
        opts.cropOffsets = params.grid_crop as [
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
        ];
      }
      if (params.grid_trim) {
        opts.trimStart = params.grid_trim.start_s;
        opts.trimEnd = params.grid_trim.end_s;
      }
      await renderGrid(inputs as [string, string, string, string], out, opts);
    } else {
      await renderSequence(inputs, out, {
        segments: params.fade_segments,
        transitions: params.fade_transitions,
        transition: params.fade_transition,
        transitionDuration: params.fade_transition_duration,
        closing: params.fade_closing,
        audioClips: params.fade_audio_clips ? await Promise.all(params.fade_audio_clips.map(async (c, index) => ({
          path: await fetchMediaTo(dir, c.media_id, `audio-clip-${index}`),
          sourceStart: c.source_start_s, sourceEnd: c.source_end_s, start: c.start_s, volume: c.volume,
        }))) : undefined,
        width: (videoAspectById(params.aspect_ratio) ?? VIDEO_PRESETS[0].aspect).width,
        height: (videoAspectById(params.aspect_ratio) ?? VIDEO_PRESETS[0].aspect).height,
        captions: params.fade_captions ? await Promise.all(params.fade_captions.map(async (c, index) => ({
          path: await fetchMediaTo(dir, c.media_id, `caption-${index}`),
          x: c.x, y: c.y, width: c.width, start: c.start_s, end: c.end_s,
        }))) : undefined,
        visualLayers: params.fade_visual_layers ? await Promise.all(params.fade_visual_layers.map(async (layer, index) => ({
          path: await fetchMediaTo(dir, layer.media_id, `visual-layer-${index}`),
          row: layer.row, x: layer.x, y: layer.y, width: layer.width, start: layer.start_s, end: layer.end_s, chroma: layer.chroma,
        }))) : undefined,
      });
    }
    await finishJob(job, out);
  });
}

async function submitGeneration(job: StudioJobRow, params: StudioParams): Promise<void> {
  const persona = params.persona!;
  const provider = "replicate";
  let jobId: string;
  if (persona.source === "stock") {
    ({ jobId } = await submitAvatarJob({ image: stockPersonaImage(persona.id!), script: params.script!, voice: params.voice }));
  } else {
    const image = await readMediaBytes(persona.image_media_id!);
    if (!image) throw new Error("Persona image is missing from storage.");
    ({ jobId } = await submitAvatarJob({
      image: imageDataUri(image.bytes, image.row.mime_type),
      script: params.script!,
      voice: params.voice,
    }));
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
    job.provider === "replicate"
      ? await pollAvatarJob(job.provider_job_id!)
      : { status: "failed", error: "This render uses a retired provider. Please generate it again." };

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
  const params = JSON.parse(job.params) as StudioParams;
  const platform = (params.output_platform_id || "video")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "video";
  const timestamp = job.created_at
    .replace("T", "_")
    .replace(/[ :]/g, "-")
    .replace(/\.\d+Z?$/, "")
    .slice(0, 16);
  const name = `${platform}_${timestamp}.mp4`;
  const row: MediaRow = await importFromFile(job.workspace_id, filePath, name, "video/mp4");
  const meta = await probe(filePath);
  await patchRecord("media", row.id, {
    duration_s: meta.duration_s,
    width: meta.width,
    height: meta.height,
  });
  // AI UGC files itself into the Library the moment it renders, rather than
  // waiting for the wizard's Finish button — a render the user never clicked
  // through would otherwise sit in Uploads as an anonymous file. Deliberately
  // no draftId: leaving studio_draft_id null is what keeps the row visible
  // while its draft is still open (see app/dashboard/library/page.tsx). Finish
  // later re-patches this same row with platforms and captions.
  if (job.template === "ai-ugc") {
    await markMediaFinished(job.workspace_id, [row.id], "ai-ugc", {
      campaignName: params.campaign_name,
    });
  }
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
