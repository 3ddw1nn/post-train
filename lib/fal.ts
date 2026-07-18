// fal.ai client (custom persona path): face image + script → TTS audio →
// Kling AI Avatar v2 talking video. Pay-per-use, no subscription.
// Plain fetch against fal's HTTP APIs — no SDK dependency.
import { MOCK_OUTPUT_URL, studioMock, type ProviderJobState } from "./creatify";

const TTS_MODEL = "fal-ai/minimax/speech-02-hd";
const AVATAR_MODEL = "fal-ai/kling-video/ai-avatar/v2/standard";
// fal queue request URLs use the root app id (first two path segments).
const AVATAR_ROOT = AVATAR_MODEL.split("/").slice(0, 2).join("/");

// Published pay-as-you-go rates, surfaced to users in the wizard for
// transparency. Update alongside https://fal.ai/models pricing.
export const FAL_AVATAR_PER_SECOND = 0.0562; // Kling AI Avatar v2 standard, $/sec of output

export function falEnabled(): boolean {
  return !!process.env.FAL_KEY && !studioMock();
}

const authHeader = () => ({ Authorization: `Key ${process.env.FAL_KEY}` });

async function falJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeader(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`fal ${url} failed (${res.status}): ${body}`);
  }
  return await res.json();
}

/** Upload bytes to fal storage so generation inputs work from dev/local-disk media too. */
export async function falUploadBytes(bytes: Buffer, mime: string, name: string): Promise<string> {
  const initiate = (await falJson(
    "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
    { method: "POST", body: JSON.stringify({ file_name: name, content_type: mime }) }
  )) as { upload_url: string; file_url: string };
  const put = await fetch(initiate.upload_url, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) throw new Error(`fal storage upload failed (${put.status})`);
  return initiate.file_url;
}

/**
 * Text → speech (synchronous — takes seconds), then queue the avatar video job.
 * Returns the queue request id polled by `pollAvatarJob`.
 */
export async function submitAvatarJob(opts: { imageUrl: string; script: string }): Promise<{ jobId: string }> {
  if (!falEnabled()) return { jobId: `mock_${crypto.randomUUID()}` };
  const tts = (await falJson(`https://fal.run/${TTS_MODEL}`, {
    method: "POST",
    body: JSON.stringify({ text: opts.script, output_format: "url" }),
  })) as { audio: { url: string } };
  const queued = (await falJson(`https://queue.fal.run/${AVATAR_MODEL}`, {
    method: "POST",
    body: JSON.stringify({ image_url: opts.imageUrl, audio_url: tts.audio.url }),
  })) as { request_id: string };
  return { jobId: queued.request_id };
}

export async function pollAvatarJob(jobId: string): Promise<ProviderJobState> {
  if (jobId.startsWith("mock_")) return { status: "done", outputUrl: MOCK_OUTPUT_URL };
  const status = (await falJson(
    `https://queue.fal.run/${AVATAR_ROOT}/requests/${jobId}/status`
  )) as { status: string; error?: string };
  if (status.status === "COMPLETED") {
    const result = (await falJson(`https://queue.fal.run/${AVATAR_ROOT}/requests/${jobId}`)) as {
      video?: { url?: string };
    };
    if (result.video?.url) return { status: "done", outputUrl: result.video.url };
    return { status: "failed", error: "fal returned no video output." };
  }
  if (["FAILED", "ERROR", "CANCELLED"].includes(status.status)) {
    return { status: "failed", error: status.error ?? `fal job ${status.status.toLowerCase()}.` };
  }
  return { status: "running" };
}
