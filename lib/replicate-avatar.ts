// Pay-as-you-go talking-avatar provider. A portrait + script is rendered by
// Replicate's P-Video Avatar model; no monthly actor-library commitment.
import { readFileSync } from "node:fs";
import path from "node:path";
import { MOCK_OUTPUT_URL, studioMock, type ProviderJobState } from "./creatify";
import { synthesizeSpeech } from "./voice-preview";

const BASE = "https://api.replicate.com/v1";
const MODEL = "prunaai/p-video-avatar";

export type StudioPersona = {
  id: string;
  name: string;
  preview_image_url: string;
  source: "stock";
  is_demo: boolean;
  default_voice: string;
};

const STOCK_PERSONAS = [
  ["maya", "Maya", "Kore (Female)"],
  ["jordan", "Jordan", "Puck (Male)"],
  ["priya", "Priya", "Aoede (Female)"],
  ["leo", "Leo", "Charon (Male)"],
] as const;

/** The model's full voice enum — see the `voice` input at
 *  replicate.com/prunaai/p-video-avatar. Doubles as its own display label. */
export const VOICES = [
  "Zephyr (Female)", "Puck (Male)", "Charon (Male)", "Kore (Female)", "Fenrir (Male)",
  "Leda (Female)", "Orus (Male)", "Aoede (Female)", "Callirrhoe (Female)", "Autonoe (Female)",
  "Enceladus (Male)", "Iapetus (Male)", "Umbriel (Male)", "Algenib (Male)", "Despina (Female)",
  "Erinome (Female)", "Laomedeia (Female)", "Achernar (Female)", "Algieba (Male)", "Schedar (Male)",
  "Gacrux (Female)", "Pulcherrima (Female)", "Achird (Male)", "Zubenelgenubi (Male)", "Vindemiatrix (Female)",
  "Sadachbia (Male)", "Sadaltager (Male)", "Sulafat (Female)", "Alnilam (Male)", "Rasalgethi (Male)",
] as const;
export const DEFAULT_VOICE: (typeof VOICES)[number] = "Puck (Male)";

export function replicateEnabled(): boolean {
  return !!process.env.REPLICATE_API_TOKEN && !studioMock();
}

export function listPersonas(): StudioPersona[] {
  return STOCK_PERSONAS.map(([id, name, voice]) => ({
    id: `stock-${id}`,
    name,
    preview_image_url: `/ai-personas/${id}.png`,
    source: "stock",
    is_demo: !replicateEnabled(),
    default_voice: voice,
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
  voice?: string;
}): Promise<{ jobId: string }> {
  if (!replicateEnabled()) {
    if (studioMock()) return { jobId: `mock_${crypto.randomUUID()}` };
    throw new Error("AI UGC is not configured. Add REPLICATE_API_TOKEN to enable video generation.");
  }
  // Speech is synthesized here rather than by the model: it ignores its own
  // `voice` enum and always speaks in its default Zephyr (Female). Handing it
  // finished `audio` is the model's documented override, and it lip-syncs to
  // that audio exactly as it would to its own. See lib/voice-preview.ts.
  //
  // ponytail: image and audio both ride along as base64 data URIs. Ceiling is
  // request size — a max-length (600 char) script plus a persona portrait is
  // roughly 5.6 MB of JSON. Upgrade path if that ever bites is uploading both
  // to R2 first (lib/r2.ts) and passing signed URLs instead.
  const wav = await synthesizeSpeech(opts.voice ?? DEFAULT_VOICE, opts.script);
  const result = (await replicateFetch(`/models/${MODEL}/predictions`, {
    method: "POST",
    body: JSON.stringify({
      input: {
        image: opts.image,
        audio: `data:audio/wav;base64,${wav.toString("base64")}`,
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
