// Pay-as-you-go talking-avatar provider. A portrait + script is rendered by
// Replicate's P-Video Avatar model; no monthly actor-library commitment.
import { readFileSync } from "node:fs";
import path from "node:path";
import { MOCK_OUTPUT_URL, studioMock, type ProviderJobState } from "./creatify";

const BASE = "https://api.replicate.com/v1";
const MODEL = "prunaai/p-video-avatar";

export type StudioPersona = {
  id: string;
  name: string;
  preview_image_url: string;
  source: "stock";
  is_demo: boolean;
};

const STOCK_PERSONAS = [
  ["maya", "Maya"],
  ["jordan", "Jordan"],
  ["priya", "Priya"],
  ["leo", "Leo"],
] as const;

export function replicateEnabled(): boolean {
  return !!process.env.REPLICATE_API_TOKEN && !studioMock();
}

export function listPersonas(): StudioPersona[] {
  return STOCK_PERSONAS.map(([id, name]) => ({
    id: `stock-${id}`,
    name,
    preview_image_url: `/ai-personas/${id}.png`,
    source: "stock",
    is_demo: !replicateEnabled(),
  }));
}

/** Returns our original stock portrait as a provider-safe data URI. */
export function stockPersonaImage(personaId: string): string {
  const slug = personaId.replace(/^stock-/, "");
  if (!STOCK_PERSONAS.some(([id]) => id === slug)) throw new Error("Unknown stock persona.");
  const file = path.join(process.cwd(), "public", "ai-personas", `${slug}.png`);
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

export function imageDataUri(bytes: Buffer, mime: string): string {
  if (!mime.startsWith("image/")) throw new Error("Persona image must be an image file.");
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function replicateFetch(pathname: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN ?? ""}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Replicate ${pathname} failed (${res.status}): ${body}`);
  }
  return await res.json();
}

export async function submitAvatarJob(opts: {
  image: string;
  script: string;
}): Promise<{ jobId: string }> {
  if (!replicateEnabled()) {
    if (studioMock()) return { jobId: `mock_${crypto.randomUUID()}` };
    throw new Error("AI UGC is not configured. Add REPLICATE_API_TOKEN to enable video generation.");
  }
  const result = (await replicateFetch(`/models/${MODEL}/predictions`, {
    method: "POST",
    body: JSON.stringify({
      input: {
        image: opts.image,
        voice_script: opts.script,
        resolution: "720p",
        video_prompt: "The person speaks naturally to camera with subtle, friendly gestures.",
        negative_prompt: "subtitles, text, watermark, scene change, blurry, distorted face",
      },
    }),
  })) as { id?: string };
  if (!result.id) throw new Error("Replicate did not return a prediction id.");
  return { jobId: result.id };
}

export async function pollAvatarJob(jobId: string): Promise<ProviderJobState> {
  if (jobId.startsWith("mock_")) return { status: "done", outputUrl: MOCK_OUTPUT_URL };
  const result = (await replicateFetch(`/predictions/${jobId}`)) as {
    status?: string;
    output?: string | string[] | null;
    error?: string | null;
  };
  if (result.status === "succeeded") {
    const output = Array.isArray(result.output) ? result.output[0] : result.output;
    return output ? { status: "done", outputUrl: output } : { status: "failed", error: "Replicate returned no video output." };
  }
  if (["failed", "canceled"].includes(result.status ?? "")) {
    return { status: "failed", error: result.error ?? `Replicate job ${result.status}.` };
  }
  return { status: "running" };
}
