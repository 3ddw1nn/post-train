// Speech synthesis for AI UGC renders (lib/replicate-avatar.ts's
// submitAvatarJob), and the on-demand fallback behind the voice picker.
//
// Previews are normally pre-generated static files (see
// scripts/generate-voice-previews.mjs and public/voice-previews/), so a click
// just plays a file. Gemini's free tier allows only ~10 TTS calls per *day*,
// so that set is being filled in over several runs; until it's complete,
// voices without a file fall back to synthesizeVoicePreview below.
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

async function callGemini(apiKey: string, voiceName: string, text: string): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  });
}

/** Spoken `text` in `voice`, as a browser/ffmpeg-playable WAV. */
export async function synthesizeSpeech(voice: string, text: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new DomainError(503, "Voice generation is not configured. Add GEMINI_API_KEY.");
  const voiceName = bareVoiceName(voice);

  let res = await callGemini(apiKey, voiceName, text);
  // Gemini TTS occasionally decides to respond to the text conversationally
  // instead of just reading it aloud, and refuses with 400 INVALID_ARGUMENT.
  // Confirmed non-deterministic against the same request (2 of 3 identical
  // calls succeeded in testing) — one retry clears it almost every time.
  for (let attempt = 0; !res.ok && res.status === 400 && attempt < 2; attempt++) {
    res = await callGemini(apiKey, voiceName, text);
  }

  if (res.status === 429) {
    // Free-tier keys cap this model at 10 requests/minute.
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

/** The line every pre-generated preview reads — kept identical to
 *  scripts/generate-voice-previews.mjs so the on-demand fallback and the
 *  static files are indistinguishable to a listener. */
const SAMPLE_SCRIPT = "Hey! This is a quick preview of how I sound.";

// ponytail: in-process cache, so auditioning a not-yet-generated voice twice
// only spends one of the day's ~10 free TTS calls. Ceiling is process
// lifetime; it disappears entirely once every voice has a static file.
const g = globalThis as unknown as { __ptVoicePreviews?: Map<string, Buffer> };
const cache = (g.__ptVoicePreviews ??= new Map<string, Buffer>());

export async function synthesizeVoicePreview(voice: string): Promise<Buffer> {
  const cached = cache.get(voice);
  if (cached) return cached;
  const wav = await synthesizeSpeech(voice, SAMPLE_SCRIPT);
  cache.set(voice, wav);
  return wav;
}
