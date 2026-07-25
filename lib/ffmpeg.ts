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

// Output format: h264+aac. Single-clip templates still use the legacy
// 1080x1920/30fps path; grid accepts explicit dimensions/fps from the editor.
const SCALE_FULL = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1";
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

export type GridBorder = { width: number; color: string; opacity: number };
export type GridOptions = {
  width?: number;
  height?: number;
  fps?: number;
  // Which clips' audio to keep (0-3) — multiple are mixed together — plus an
  // optional external track mixed in on top. Empty/none renders silent.
  audioClips?: number[];
  audioPath?: string;
  border?: GridBorder;
};

// Interior "+" separators drawn over the packed grid with drawbox, so the color
// blends over the video underneath (opacity is meaningful). No outer frame —
// borders sit only between the quadrants. Returns a chain suffix ("" when off).
function gridScaleFilter(width: number, height: number, fps: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1`;
}

function gridBorderChain(outputWidth: number, outputHeight: number, border?: GridBorder): string {
  if (!border || border.width <= 0) return "";
  const w = Math.round(Math.min(40, Math.max(1, border.width)));
  const hex = /^#?[0-9a-fA-F]{6}$/.test(border.color) ? border.color.replace("#", "") : "ffffff";
  const alpha = Math.min(1, Math.max(0, border.opacity));
  const color = `0x${hex}@${alpha}`;
  const vx = Math.round(outputWidth / 2 - w / 2);
  const hy = Math.round(outputHeight / 2 - w / 2);
  return `,drawbox=x=${vx}:y=0:w=${w}:h=${outputHeight}:color=${color}:t=fill,drawbox=x=0:y=${hy}:w=${outputWidth}:h=${w}:color=${color}:t=fill`;
}

/**
 * 2x2 grid of four clips, ending with the shortest input. Audio is mixed from
 * any subset of the clips (`audioClips`, default the top-left clip) plus an
 * optional uploaded track (`audioPath`); an empty selection renders silent.
 * Optional colored separators are drawn between the quadrants.
 */
export async function renderGrid(
  inputs: [string, string, string, string],
  out: string,
  opts: GridOptions = {}
): Promise<void> {
  const outputWidth = Math.max(2, Math.round(opts.width ?? 1080));
  const outputHeight = Math.max(2, Math.round(opts.height ?? 1920));
  const quadWidth = Math.round(outputWidth / 2);
  const quadHeight = Math.round(outputHeight / 2);
  const fps = Math.round(opts.fps ?? 60);
  const scaled = inputs.map((_, i) => `[${i}:v]${gridScaleFilter(quadWidth, quadHeight, fps)}[v${i}]`).join(";");
  const border = gridBorderChain(outputWidth, outputHeight, opts.border);
  const videoGraph = `${scaled};[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0${border}[v]`;
  const args = [...inputs.flatMap((f) => ["-i", f])]; // clip inputs occupy 0-3

  // Collect every audio stream to mix: each selected clip that actually has
  // audio, then the uploaded track (appended as the next input). A silence
  // source is only needed when nothing else contributes.
  const wantClips = [...new Set(opts.audioClips ?? [0])].filter((i) => i >= 0 && i <= 3);
  const sources: string[] = [];
  for (const idx of wantClips) {
    if ((await probe(inputs[idx])).has_audio) sources.push(`${idx}:a`);
  }
  if (opts.audioPath) {
    args.push("-i", opts.audioPath);
    sources.push("4:a"); // next input index after the four clips
  }

  let audioGraph = "";
  let audioMap: string;
  if (sources.length === 0) {
    args.push(...SILENCE);
    audioMap = `${inputs.length}:a`; // the anullsrc input
  } else if (sources.length === 1) {
    audioMap = sources[0];
  } else {
    // normalize=0 keeps each source at its own level so layered instruments
    // stay balanced instead of being divided down by the input count.
    audioGraph = `;${sources.map((s) => `[${s}]`).join("")}amix=inputs=${sources.length}:duration=shortest:normalize=0[aout]`;
    audioMap = "[aout]";
  }

  await runFfmpeg([
    ...args,
    "-filter_complex", `${videoGraph}${audioGraph}`,
    "-map", "[v]", "-map", audioMap, "-shortest",
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

const SCALE_SLIDE = "scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350";

/** Re-encode a photo to the shared slideshow frame size, no overlay. */
export async function normalizeSlideImage(basePath: string, out: string): Promise<void> {
  await runFfmpeg([
    "-i", basePath,
    "-vf", SCALE_SLIDE,
    "-frames:v", "1", "-q:v", "2", out,
  ]);
}

/** Still-image analog of renderOne's overlay branch — bakes a caption PNG onto a static photo. */
export async function compositeImageOverlay(basePath: string, overlayPngPath: string, out: string): Promise<void> {
  await runFfmpeg([
    "-loop", "1", "-i", basePath,
    "-i", overlayPngPath,
    "-filter_complex",
    `[0:v]${SCALE_SLIDE}[base];[1:v]scale=980:-1[cap];[base][cap]overlay=(W-w)/2:H*0.10[v]`,
    "-map", "[v]", "-frames:v", "1", "-q:v", "2", out,
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
