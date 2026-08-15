#!/usr/bin/env node
// One-off script — NOT a permanent npm script, run manually whenever the
// voice list or sample script changes. Generates a static preview clip per
// AI UGC voice and writes it to public/voice-previews/<slug>.wav, so the
// studio's preview button plays a pre-baked file instead of calling Gemini
// TTS (and hitting its 10 req/min free-tier limit) on every click. The
// sample script never changes per-user, so there is nothing to generate at
// request time — see lib/voice-preview.ts's synthesizeSpeech for the
// separate, still-dynamic path used by real renders (the user's own script).
//
// Idempotent/resumable: skips a voice if its file already exists, so a run
// interrupted by a rate limit can just be re-run.
//
// Usage: node --env-file=.env.local scripts/generate-voice-previews.mjs

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — run with: node --env-file=.env.local scripts/generate-voice-previews.mjs`);
  return v;
}

const apiKey = required("GEMINI_API_KEY");
const MODEL = "gemini-2.5-flash-preview-tts";
const SAMPLE_SCRIPT = "Hey! This is a quick preview of how I sound.";
const OUT_DIR = path.join(process.cwd(), "public", "voice-previews");
// How long to wait out a rate limit on one voice before deferring it to a
// later run. Lower it (MAX_RATE_LIMIT_RETRIES=2) to sweep the remaining
// voices quickly instead of blocking ~60s per retry on a stubborn one.
const MAX_RATE_LIMIT_RETRIES = Number(process.env.MAX_RATE_LIMIT_RETRIES ?? 10);

// Mirrors lib/replicate-avatar.ts's VOICES — kept in sync by hand since this
// script can't import that TS module directly. If you add a voice there,
// add it here too and re-run.
const VOICES = [
  "Zephyr (Female)", "Puck (Male)", "Charon (Male)", "Kore (Female)", "Fenrir (Male)",
  "Leda (Female)", "Orus (Male)", "Aoede (Female)", "Callirrhoe (Female)", "Autonoe (Female)",
  "Enceladus (Male)", "Iapetus (Male)", "Umbriel (Male)", "Algenib (Male)", "Despina (Female)",
  "Erinome (Female)", "Laomedeia (Female)", "Achernar (Female)", "Algieba (Male)", "Schedar (Male)",
  "Gacrux (Female)", "Pulcherrima (Female)", "Achird (Male)", "Zubenelgenubi (Male)", "Vindemiatrix (Female)",
  "Sadachbia (Male)", "Sadaltager (Male)", "Sulafat (Female)", "Alnilam (Male)", "Rasalgethi (Male)",
];

function bareVoiceName(voice) {
  return voice.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
function voiceSlug(voice) {
  return bareVoiceName(voice).toLowerCase();
}

function pcmToWav(pcm, sampleRate, channels, bitsPerSample) {
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function callGemini(voiceName) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: SAMPLE_SCRIPT }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  });
}

async function synthesize(voiceName) {
  let res = await callGemini(voiceName);
  // Gemini TTS occasionally decides to respond conversationally instead of
  // reading the text aloud, and refuses with 400 INVALID_ARGUMENT — confirmed
  // non-deterministic (2 of 3 identical calls succeeded in testing). Some
  // voices refuse several times in a row, so retry harder here than the
  // request path does: this runs once, offline, and a voice we give up on
  // leaves a permanent hole in the picker. See lib/voice-preview.ts.
  for (let attempt = 0; !res.ok && res.status === 400 && attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await callGemini(voiceName);
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => null);
    const retryMatch = body?.error?.message?.match(/retry in ([\d.]+)s/i);
    const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : 65;
    return { rateLimited: true, retrySeconds };
  }
  if (!res.ok) {
    throw new Error(`${voiceName} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error(`${voiceName} returned no audio.`);
  return { wav: pcmToWav(Buffer.from(b64, "base64"), 24000, 1, 16) };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let generated = 0;
  let skipped = 0;
  const deferred = [];

  for (const voice of VOICES) {
    const slug = voiceSlug(voice);
    const file = path.join(OUT_DIR, `${slug}.wav`);
    if (existsSync(file)) {
      console.log(`skip   ${slug} (already exists)`);
      skipped++;
      continue;
    }

    let attempt = 0;
    for (;;) {
      const result = await synthesize(bareVoiceName(voice));
      if (result.rateLimited) {
        attempt++;
        // Retries are cheap (they just wait out Gemini's own suggested
        // delay), and the window has been observed recovering reliably
        // within it — worth being patient rather than giving up.
        if (attempt > MAX_RATE_LIMIT_RETRIES) {
          // Give up on THIS voice, not the run. Aborting here used to strand
          // every voice after it unattempted, so one stubborn voice cost a
          // whole pass; the script is resumable (it skips existing files),
          // so the leftovers are just picked up next run.
          console.log(`skip   ${slug} — still rate-limited after ${attempt - 1} retries, leaving for the next run`);
          deferred.push(slug);
          break;
        }
        console.log(`limit  ${slug} — waiting ${result.retrySeconds}s (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, result.retrySeconds * 1000));
        continue;
      }
      writeFileSync(file, result.wav);
      console.log(`done   ${slug}  (${(result.wav.length / 1024).toFixed(0)} KB)`);
      generated++;
      break;
    }
    // Free-tier cap is 10/min — pace requests well under that instead of
    // bursting and eating the retry delay on almost every call.
    await new Promise((r) => setTimeout(r, 7000));
  }

  console.log(`\n${generated} generated, ${skipped} already present, ${VOICES.length} total.`);
  if (deferred.length) {
    console.log(`${deferred.length} deferred (rate limit): ${deferred.join(", ")} — re-run to pick them up.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
