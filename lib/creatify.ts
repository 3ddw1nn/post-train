// Creatify API client (stock UGC persona path): script + persona id → talking
// video. Plain fetch, mirroring convex/supportChat.ts's provider style.
// Docs: https://docs.creatify.ai — auth via X-API-ID / X-API-KEY headers.

const BASE = "https://api.creatify.ai";

export type StudioPersona = {
  id: string;
  name: string;
  preview_image_url: string | null;
  preview_video_url: string | null;
  source: "stock";
};

export type ProviderJobState = {
  status: "running" | "done" | "failed";
  outputUrl?: string;
  error?: string;
};

export function creatifyEnabled(): boolean {
  return !!(process.env.CREATIFY_API_ID && process.env.CREATIFY_API_KEY) && !studioMock();
}

/** Mock mode: no provider spend — enabled explicitly or when dev has no provider keys. */
export function studioMock(): boolean {
  if (process.env.STUDIO_MOCK === "1") return true;
  if (process.env.STUDIO_MOCK === "0") return false;
  const anyKey =
    (process.env.CREATIFY_API_ID && process.env.CREATIFY_API_KEY) || process.env.FAL_KEY;
  return process.env.NODE_ENV !== "production" && !anyKey;
}

/** Output URL sentinel that tells the worker to render a local placeholder clip. */
export const MOCK_OUTPUT_URL = "mock:placeholder";

function headers(): Record<string, string> {
  return {
    "X-API-ID": process.env.CREATIFY_API_ID ?? "",
    "X-API-KEY": process.env.CREATIFY_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

async function creatifyFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Creatify ${path} failed (${res.status}): ${body}`);
  }
  return await res.json();
}

const MOCK_PERSONAS: StudioPersona[] = [
  "Maya", "Jake", "Priya", "Leo", "Sofia", "Ethan",
].map((name, i) => ({
  id: `mock-persona-${i}`,
  name,
  preview_image_url: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320"><rect width="180" height="320" fill="hsl(${i * 55},55%,45%)"/><circle cx="90" cy="120" r="48" fill="hsl(${i * 55},45%,75%)"/><rect x="42" y="185" width="96" height="90" rx="40" fill="hsl(${i * 55},45%,75%)"/><text x="90" y="300" text-anchor="middle" font-family="sans-serif" font-size="22" fill="white">${name}</text></svg>`
  )}`,
  preview_video_url: null,
  source: "stock" as const,
}));

// ponytail: in-memory 1h cache, per process (same globalThis idiom as lib/db.ts).
const g = globalThis as unknown as { __ptPersonas?: { at: number; data: StudioPersona[] } };

export async function listPersonas(): Promise<StudioPersona[]> {
  if (!creatifyEnabled()) return MOCK_PERSONAS;
  if (g.__ptPersonas && Date.now() - g.__ptPersonas.at < 60 * 60_000) return g.__ptPersonas.data;
  const raw = (await creatifyFetch("/api/personas/")) as Record<string, unknown>[];
  const data = raw.map((p) => ({
    id: String(p.id),
    name: String(p.creator_name ?? p.name ?? "Persona"),
    preview_image_url: (p.preview_image_9_16 ?? p.preview_image_1_1 ?? p.preview_image ?? null) as string | null,
    preview_video_url: (p.preview_video_9_16 ?? p.preview_video_1_1 ?? p.preview_video ?? null) as string | null,
    source: "stock" as const,
  }));
  g.__ptPersonas = { at: Date.now(), data };
  return data;
}

export async function createLipsync(opts: {
  personaId: string;
  script: string;
  aspectRatio: string;
}): Promise<{ jobId: string }> {
  if (!creatifyEnabled()) return { jobId: `mock_${crypto.randomUUID()}` };
  const res = (await creatifyFetch("/api/lipsyncs/", {
    method: "POST",
    body: JSON.stringify({
      text: opts.script,
      creator: opts.personaId,
      aspect_ratio: opts.aspectRatio,
      no_caption: true,
      no_music: true,
    }),
  })) as { id: string };
  return { jobId: res.id };
}

export async function getLipsync(jobId: string): Promise<ProviderJobState> {
  if (jobId.startsWith("mock_")) return { status: "done", outputUrl: MOCK_OUTPUT_URL };
  const res = (await creatifyFetch(`/api/lipsyncs/${jobId}/`)) as {
    status: string;
    output?: string | null;
    failed_reason?: string | null;
  };
  if (res.status === "done" && res.output) return { status: "done", outputUrl: res.output };
  if (res.status === "failed" || res.status === "error") {
    return { status: "failed", error: res.failed_reason ?? "Creatify generation failed." };
  }
  return { status: "running" };
}
