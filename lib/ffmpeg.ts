// Local ffmpeg rendering for Content Studio templates.
// Caption text is rendered to a transparent PNG by the browser (canvas) and
// composited here with the core `overlay` filter — no freetype/drawtext or
// server fonts needed, which slim ffmpeg builds (incl. current homebrew
// bottles) don't ship.
// ponytail: renders run on the app machine's CPU (worker process). Fine for
// short vertical clips; the upgrade path for heavy volume is fal.ai's
// ffmpeg-api or a dedicated render machine.
import { spawn } from "node:child_process";
import path from "node:path";

const FFMPEG = () => process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = () => process.env.FFPROBE_PATH ?? "ffprobe";

// Output format shared by all templates: 1080x1920 vertical, 30fps, h264+aac.
const SCALE_FULL = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1";
const SCALE_QUAD = "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=30,setsar=1";
const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-ar", "44100"];
const SILENCE = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

function run(bin: string, args: string[], timeoutMs = 10 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${bin} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err = (err + d).slice(-2048)));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`${bin} failed to start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited ${code}: ${err.trim()}`));
    });
  });
}

export const runFfmpeg = (args: string[], timeoutMs?: number) =>
  run(FFMPEG(), ["-y", "-hide_banner", "-loglevel", "error", ...args], timeoutMs);

let ffmpegOk: boolean | null = null;
export async function assertFfmpeg(): Promise<void> {
  if (ffmpegOk === null) {
    ffmpegOk = await run(FFMPEG(), ["-version"], 10_000).then(() => true, () => false);
  }
  if (!ffmpegOk) {
    throw new Error("ffmpeg is not installed on this machine (dev: `brew install ffmpeg`).");
  }
}

export async function probe(file: string): Promise<{ duration_s: number | null; width: number | null; height: number | null; has_audio: boolean }> {
  try {
    const out = await run(FFPROBE(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 30_000);
    const info = JSON.parse(out);
    const streams: { codec_type?: string; width?: number; height?: number }[] = info.streams ?? [];
    const video = streams.find((s) => s.codec_type === "video");
    const duration = Number(info.format?.duration);
    return {
      duration_s: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      has_audio: streams.some((s) => s.codec_type === "audio"),
    };
  } catch {
    return { duration_s: null, width: null, height: null, has_audio: false };
  }
}

/**
 * Single-input render helper: applies `videoFilters` to the video stream,
 * optionally overlays a caption PNG, and keeps the clip's own audio (or
 * injects silence when it has none).
 */
async function renderOne(input: string, out: string, videoFilters: string[], overlayPng?: string): Promise<void> {
  const { has_audio } = await probe(input);
  const inputs = ["-i", input, ...(overlayPng ? ["-i", overlayPng] : []), ...(has_audio ? [] : SILENCE)];
  const audioIdx = overlayPng ? 2 : 1;
  const graph = overlayPng
    ? `[0:v]${videoFilters.join(",")}[base];[1:v]scale=980:-1[cap];[base][cap]overlay=(W-w)/2:H*0.10[v]`
    : `[0:v]${videoFilters.join(",")}[v]`;
  await runFfmpeg([
    ...inputs,
    "-filter_complex", graph,
    "-map", "[v]", "-map", has_audio ? "0:a" : `${audioIdx}:a`,
    ...(has_audio ? [] : ["-shortest"]),
    ...ENCODE, out,
  ]);
}

/** Re-encode to the shared 1080x1920/30fps format, adding silent audio when a clip has none. */
export const normalizeClip = (input: string, out: string) => renderOne(input, out, [SCALE_FULL]);

/** 2x2 grid of four clips; audio comes from the first clip; ends with the shortest clip. */
export async function renderGrid(inputs: [string, string, string, string], out: string): Promise<void> {
  const { has_audio } = await probe(inputs[0]);
  const scaled = inputs.map((_, i) => `[${i}:v]${SCALE_QUAD}[v${i}]`).join(";");
  await runFfmpeg([
    ...inputs.flatMap((f) => ["-i", f]),
    ...(has_audio ? [] : SILENCE),
    "-filter_complex", `${scaled};[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]`,
    "-map", "[v]", "-map", has_audio ? "0:a" : "4:a", "-shortest",
    ...ENCODE, out,
  ]);
}

/** Single clip with a 1s fade-in and an optional caption PNG overlay. */
export async function renderFadeIn(input: string, out: string, captionPng?: string): Promise<void> {
  await renderOne(input, out, [SCALE_FULL, "fade=t=in:st=0:d=1"], captionPng);
}

/** Concatenate clips back to back (each normalized first so streams match). */
export async function concatClips(inputs: string[], out: string): Promise<void> {
  const dir = path.dirname(out);
  const normalized: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const n = path.join(dir, `norm-${i}.mp4`);
    await normalizeClip(inputs[i], n);
    normalized.push(n);
  }
  const pairs = normalized.map((_, i) => `[${i}:v][${i}:a]`).join("");
  await runFfmpeg([
    ...normalized.flatMap((f) => ["-i", f]),
    "-filter_complex", `${pairs}concat=n=${normalized.length}:v=1:a=1[v][a]`,
    "-map", "[v]", "-map", "[a]",
    ...ENCODE, out,
  ]);
}

/** Mock-mode stand-in for provider generation: animated test pattern, no external calls. */
export async function renderPlaceholder(out: string, seconds = 6): Promise<void> {
  await runFfmpeg([
    "-f", "lavfi", "-i", `testsrc2=s=1080x1920:d=${seconds}:r=30`,
    ...SILENCE,
    "-map", "0:v", "-map", "1:a", "-t", String(seconds), ...ENCODE, out,
  ]);
}
