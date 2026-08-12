// Speech synthesis for AI UGC, used in two places:
//   - the voice picker's preview button (synthesizeVoicePreview)
//   - the real render's audio track (synthesizeSpeech, via submitAvatarJob)
//
// Both go through the same Gemini voices the avatar model itself wraps, so a
// preview is a truthful sample of the final video rather than a lookalike.
//
// We generate the audio ourselves rather than letting the avatar model do its
// own TTS because prunaai/p-video-avatar accepts its `voice` enum and then
// ignores it, always falling back to its default Zephyr (Female) — verified by
// measuring output pitch against each voice. Its `audio` input documents that
// supplied audio replaces "voice_script and voice settings", and the model
// still lip-syncs to it, so this is the model's own supported path, not a
// workaround bolted on the side.
import { DomainError } from "./posts";

const MODEL = "gemini-2.5-flash-preview-tts";
// Every voice reads this same line — a shorter or longer sample would make
// voices feel faster or slower than they actually are, not a fair comparison.
const SAMPLE_SCRIPT = "Hey! This is a quick preview of how I sound.";

// ponytail: in-memory cache, per process — same idiom as lib/creatify.ts's
// persona cache. Fine at 30 fixed voices; never expires since the sample
// script never changes.
const g = globalThis as unknown as { __ptVoicePreviews?: Map<string, Buffer> };
const cache = (g.__ptVoicePreviews ??= new Map<string, Buffer>());

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** `voice` is our "Kore (Female)" label — the API wants the bare name. */
function bareVoiceName(voice: string): string {
  return voice.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Spoken `text` in `voice`, as a browser/ffmpeg-playable WAV. */
export async function synthesizeSpeech(voice: string, text: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new DomainError(503, "Voice generation is not configured. Add GEMINI_API_KEY.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: bareVoiceName(voice) } } },
        },
      }),
    },
  );
  if (res.status === 429) {
    // Free-tier keys cap this model at 10 requests/minute — easy to hit when
    // auditioning several voices back to back. Previews are cached per voice,
    // so this only bites on a first listen (or a render, which is far rarer).
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const retryMatch = body?.error?.message?.match(/retry in ([\d.]+)s/i);
    const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : null;
    throw new DomainError(
      429,
      retrySeconds
        ? `Voice generation is rate-limited — try again in ${retrySeconds}s.`
        : "Voice generation is rate-limited right now. Try again shortly.",
    );
  }
  if (!res.ok) {
    throw new Error(`Voice generation failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("Voice generation returned no audio.");

  return pcmToWav(Buffer.from(b64, "base64"), 24000, 1, 16);
}

export async function synthesizeVoicePreview(voice: string): Promise<Buffer> {
  const cached = cache.get(voice);
  if (cached) return cached;
  const wav = await synthesizeSpeech(voice, SAMPLE_SCRIPT);
  cache.set(voice, wav);
  return wav;
}
