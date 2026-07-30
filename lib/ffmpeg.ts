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
export type GridCropOffset = { x: number; y: number };
export type GridOptions = {
  width?: number;
  height?: number;
  fps?: number;
  // Which clips' audio to keep (0-3) — multiple are mixed together — plus an
  // optional external track mixed in on top. Empty/none renders silent.
  audioClips?: number[];
  audioPath?: string;
  border?: GridBorder;
  // Focal point for each clip's crop, 0-1 per axis (0.5 = centered, the old
  // default). Mirrors CSS object-position so the editor's live preview and
  // the render agree pixel-for-pixel.
  cropOffsets?: [GridCropOffset, GridCropOffset, GridCropOffset, GridCropOffset];
}

// Interior "+" separators drawn over the packed grid with drawbox, so the color
// blends over the video underneath (opacity is meaningful). No outer frame —
// borders sit only between the quadrants. Returns a chain suffix ("" when off).
function gridScaleFilter(width: number, height: number, fps: number, offset: GridCropOffset): string {
  const x = Math.min(1, Math.max(0, offset.x));
  const y = Math.min(1, Math.max(0, offset.y));
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:x=(in_w-${width})*${x}:y=(in_h-${height})*${y},fps=${fps},setsar=1`;
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
  const scaled = inputs
    .map((_, i) => `[${i}:v]${gridScaleFilter(quadWidth, quadHeight, fps, opts.cropOffsets?.[i] ?? { x: 0.5, y: 0.5 })}[v${i}]`)
    .join(";");
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

/**
 * A horizontal strip of `frames` square thumbnails, evenly spaced through the
 * video — the timeline clip backgrounds in the Video Editor Studio.
 *
 * Generated here rather than in the browser because media is served as a 302 to
 * a presigned R2 URL: a cross-origin <video> either fails to load (with
 * crossOrigin set, since presigned URLs carry no CORS headers) or taints the
 * canvas so toDataURL throws (without it). Server-side there is no such
 * problem, and the result is a plain same-origin image.
 */
export async function renderFilmstrip(input: string, out: string, tilePx = 96): Promise<void> {
  const meta = await probe(input);
  const duration = meta.duration_s && meta.duration_s > 0 ? meta.duration_s : 1;
  const frames = filmstripFrameCount(duration);
  // fps=frames/duration lands one frame in each of `frames` equal slices.
  // Nudged up slightly so rounding can't leave the last tile empty.
  const fps = Math.max(0.01, (frames + 0.5) / duration);
  const size = Math.max(16, Math.round(tilePx));
  await runFfmpeg([
    "-i", input,
    "-vf", `fps=${fps.toFixed(6)},crop='min(iw,ih)':'min(iw,ih)',scale=${size}:${size},tile=${frames}x1`,
    "-frames:v", "1",
    "-q:v", "6",
    out,
  ], 60_000);
}

/**
 * Roughly one frame every two seconds. The editor reads the count back off the
 * image itself (tiles are square, so frames = width / height), so this can
 * change without a client update — but trimming only shows a different frame
 * once it crosses a slice boundary, which is why it scales with duration
 * instead of being a flat six.
 */
export function filmstripFrameCount(durationSeconds: number): number {
  return Math.min(32, Math.max(6, Math.round(durationSeconds / 2)));
}

/**
 * A single JPEG frame at `atSeconds` — the Thumbnail Maker tool's "from video"
 * background source. Same server-side-only reasoning as renderFilmstrip above
 * (presigned R2 URLs have no CORS headers, so the browser can't grab this
 * itself). `-ss` before `-i` seeks by keyframe first, which is fast but can
 * land a couple hundred ms off; good enough for picking a thumbnail frame.
 */
export async function extractFrame(input: string, out: string, atSeconds: number): Promise<void> {
  await runFfmpeg(["-ss", Math.max(0, atSeconds).toFixed(3), "-i", input, "-frames:v", "1", "-q:v", "3", out], 30_000);
}

export type FadeSegment = { start_s?: number; end_s?: number; gap_before_s?: number; volume?: number; crop?: { x: number; y: number } };
/**
 * A transition at one seam. `transitions[0]` is the *opening* — the first
 * clip fading in from black instead of from a preceding clip — reusing the
 * same catalog of styles (wipe, circle, slide, ...) as every interior seam.
 * `type: "cut"` (or an absent entry) means no effect there.
 */
export type FadeTransitionSpec = { type: string; duration: number };
export type FadeSequenceOptions = {
  segments?: FadeSegment[];
  /** Per-seam transitions; transitions[0] is the opening. Falls back to `transition`/`transitionDuration` for any seam without its own entry. */
  transitions?: FadeTransitionSpec[];
  transition?: string;
  transitionDuration?: number;
  /** The whole sequence fading out to black at the tail. `type: "cut"` (or omitted) means no closing effect. */
  closing?: FadeTransitionSpec;
  /** Every audio clip mixed into the sequence — the uploaded soundtrack and
   *  any detached-from-video clip audio are the same shape server-side, each
   *  independently trimmed and positioned in the composed OUTPUT timeline. */
  audioClips?: FadeAudioClip[];
  width?: number;
  height?: number;
  /** Timed text overlays from the Video Editor's Captions timeline — each a
   *  transparent PNG (rasterized client-side, same reason as the file header
   *  comment) composited with `overlay`, gated to its own [start,end] window
   *  in the SAME composed-timeline seconds as `outputDuration` below. */
  captions?: FadeCaption[];
};
export type FadeAudioClip = {
  path: string;
  /** Trim window within the source file. */
  sourceStart: number;
  sourceEnd: number;
  /** Where this clip starts playing in the composed OUTPUT timeline —
   *  `sourceEnd - sourceStart` seconds after this point, it stops. */
  start: number;
  volume: number;
};
export type FadeCaption = {
  path: string;
  /** Percent of frame width the PNG should be scaled to before compositing. */
  width: number;
  /** Center position as a percent of frame width/height. */
  x: number;
  y: number;
  start: number;
  end: number;
};

/** A segment with its source window and audio resolved against the real file. */
export type ResolvedFadeSegment = {
  start: number;
  end: number;
  duration: number;
  gapBefore?: number;
  hasAudio: boolean;
  volume: number;
  crop: { x: number; y: number };
};

type ExtraInput = { kind: "file"; path: string } | { kind: "lavfi"; spec: string };

/**
 * A solid black clip lasting exactly `seconds`, for fading a real clip to/from
 * black using any xfade style (plain `fade`'s `color=` option only does a
 * linear opacity ramp, not wipes/circles/slides).
 *
 * Deliberately generated ~1 frame longer than needed via `color=...:d=`, then
 * hard-trimmed in the chain itself: the lavfi source's own frame count rounds
 * to `duration*rate`, so trusting it exactly can overshoot by a frame. An
 * overshoot on the *closing* black would silently extend the rendered output
 * past its expected duration (leftover frames appended after the transition),
 * so it's trimmed the same explicit way real segments already are.
 */
function blackSourceChain(index: number, width: number, height: number, seconds: number, label: string): { input: ExtraInput; chain: string } {
  return {
    input: { kind: "lavfi", spec: `color=c=black:s=${width}x${height}:d=${seconds + 1 / 30}:r=30` },
    chain: `[${index}:v]scale=${width}:${height},format=yuv420p,setsar=1,fps=30,trim=duration=${seconds},setpts=PTS-STARTPTS[${label}]`,
  };
}

/**
 * Build the filtergraph for a sequence. Split out from `renderFadeSequence` so
 * the per-seam transition wiring can be asserted without spawning ffmpeg —
 * see lib/fade-sequence.test.mjs.
 *
 * Clips are folded left to right, one `xfade` per seam, so each seam reads its
 * own transition and duration out of `options.transitions`. The opening and
 * closing (fade to/from black) wrap that fold rather than being part of it,
 * since there's no real clip on the other side.
 */
export function buildFadeFilterGraph(segments: ResolvedFadeSegment[], options: FadeSequenceOptions = {}) {
  if (segments.length === 0) throw new Error("Add at least one video segment.");
  const extraInputs: ExtraInput[] = [];
  const chains: string[] = [];
  const width = Math.max(2, Math.round(options.width ?? 1080));
  const height = Math.max(2, Math.round(options.height ?? 1920));
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const crop = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:x=(in_w-${width})*${segment.crop.x}:y=(in_h-${height})*${segment.crop.y},fps=30,setsar=1`;
    chains.push(`[${index}:v]${crop},trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]`);
    if (segment.hasAudio) {
      chains.push(`[${index}:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS,volume=${segment.volume}[a${index}]`);
    } else {
      chains.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${segment.duration},asetpts=PTS-STARTPTS[a${index}]`);
    }
  }

  let video = "v0";
  const opening = options.transitions?.[0];
  if (opening && opening.type !== "cut") {
    const requestedOpen = Math.min(2, Math.max(0.1, Number(opening.duration) || 0.5));
    // Never fade more than half the first clip, or the transition runs out of
    // source frames to blend partway through.
    const openDur = Math.min(requestedOpen, Math.max(0.05, segments[0].duration / 2));
    const blackIndex = segments.length + extraInputs.length;
    const black = blackSourceChain(blackIndex, width, height, openDur, "vblackopen");
    extraInputs.push(black.input);
    chains.push(black.chain);
    chains.push(`[vblackopen][v0]xfade=transition=${opening.type}:duration=${openDur}:offset=0[vopened]`);
    video = "vopened";
  }

  let audio = "a0";
  let outputDuration = segments[0].duration;
  const openingGap = Math.max(0, segments[0].gapBefore ?? 0);
  if (openingGap > 0) {
    const blackIndex = segments.length + extraInputs.length;
    const black = blackSourceChain(blackIndex, width, height, openingGap, "vgap0");
    extraInputs.push(black.input);
    chains.push(black.chain);
    chains.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${openingGap},asetpts=PTS-STARTPTS[agap0]`);
    chains.push(`[vgap0][${video}]concat=n=2:v=1:a=0[vgapjoin0]`);
    chains.push(`[agap0][${audio}]concat=n=2:v=0:a=1[agapjoin0]`);
    video = "vgapjoin0";
    audio = "agapjoin0";
    outputDuration += openingGap;
  }
  for (let index = 1; index < segments.length; index++) {
    const segment = segments[index];
    const seam = options.transitions?.[index];
    const type = seam?.type ?? options.transition ?? "fade";
    const requestedFade = Math.min(2, Math.max(0.1, Number(seam?.duration ?? options.transitionDuration) || 0.5));
    // Never overlap more than half of the shorter neighbour, or the seam eats
    // the whole clip and the timeline stops matching the render.
    const fade = Math.min(requestedFade, Math.max(0.05, Math.min(outputDuration, segment.duration) / 2));
    const nextVideo = `vjoin${index}`;
    const nextAudio = `ajoin${index}`;
    const gap = Math.max(0, segment.gapBefore ?? 0);
    if (gap > 0) {
      const blackIndex = segments.length + extraInputs.length;
      const black = blackSourceChain(blackIndex, width, height, gap, `vgap${index}`);
      extraInputs.push(black.input);
      chains.push(black.chain);
      chains.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${gap},asetpts=PTS-STARTPTS[agap${index}]`);
      chains.push(`[${video}][vgap${index}][v${index}]concat=n=3:v=1:a=0[${nextVideo}]`);
      chains.push(`[${audio}][agap${index}][a${index}]concat=n=3:v=0:a=1[${nextAudio}]`);
      outputDuration += gap + segment.duration;
    } else if (type !== "cut") {
      chains.push(`[${video}][v${index}]xfade=transition=${type}:duration=${fade}:offset=${Math.max(0, outputDuration - fade)}[${nextVideo}]`);
      chains.push(`[${audio}][a${index}]acrossfade=d=${fade}[${nextAudio}]`);
      outputDuration += segment.duration - fade;
    } else {
      chains.push(`[${video}][v${index}]concat=n=2:v=1:a=0[${nextVideo}]`);
      chains.push(`[${audio}][a${index}]concat=n=2:v=0:a=1[${nextAudio}]`);
      outputDuration += segment.duration;
    }
    video = nextVideo;
    audio = nextAudio;
  }

  if (options.closing && options.closing.type !== "cut") {
    const requestedClose = Math.min(2, Math.max(0.1, Number(options.closing.duration) || 0.5));
    const lastDuration = segments[segments.length - 1].duration;
    const closeDur = Math.min(requestedClose, Math.max(0.05, Math.min(outputDuration, lastDuration) / 2));
    const blackIndex = segments.length + extraInputs.length;
    const black = blackSourceChain(blackIndex, width, height, closeDur, "vblackclose");
    extraInputs.push(black.input);
    chains.push(black.chain);
    chains.push(`[${video}][vblackclose]xfade=transition=${options.closing.type}:duration=${closeDur}:offset=${Math.max(0, outputDuration - closeDur)}[vclosed]`);
    video = "vclosed";
    // outputDuration is unchanged: the black tail is exactly closeDur long,
    // fully consumed by the transition itself — same accounting as a normal
    // seam whose whole overlap equals the incoming clip's length.
  }

  // Caption overlays sit on top of the fully composed sequence, so their
  // [start,end] windows are already in the same seconds as outputDuration —
  // no offsetting needed. Position uses overlay's own W/H (base video) and
  // w/h (post-scale overlay) runtime variables, so one PNG rasterized at a
  // fixed reference width lands correctly regardless of this render's actual
  // output resolution (captions are shared across every platform's export).
  for (const [index, caption] of (options.captions ?? []).entries()) {
    const captionIndex = segments.length + extraInputs.length;
    extraInputs.push({ kind: "file", path: caption.path });
    const capWidthPx = Math.max(2, Math.round(width * (caption.width / 100)));
    chains.push(`[${captionIndex}:v]scale=${capWidthPx}:-1[cap${index}]`);
    chains.push(`[${video}][cap${index}]overlay=x=W*${(caption.x / 100).toFixed(4)}-w/2:y=H*${(caption.y / 100).toFixed(4)}-h/2:enable='between(t,${caption.start.toFixed(3)},${caption.end.toFixed(3)})'[vcap${index}]`);
    video = `vcap${index}`;
  }

  let finalVideo = video;
  // Every audio clip (the uploaded soundtrack and any detached clip audio)
  // gets its own input, trimmed to its own source window and delayed to
  // start at its own position in the composed OUTPUT timeline — `duration=first`
  // keeps the mix capped at the main bus's own outputDuration, same as before.
  const audioClips = options.audioClips ?? [];
  if (audioClips.length > 0) {
    const mixLabels: string[] = [];
    audioClips.forEach((clip, index) => {
      const clipIndex = segments.length + extraInputs.length;
      extraInputs.push({ kind: "file", path: clip.path });
      const volume = Number.isFinite(Number(clip.volume)) ? Math.min(2, Math.max(0, Number(clip.volume))) : 1;
      const delayMs = Math.max(0, Math.round(clip.start * 1000));
      chains.push(`[${clipIndex}:a]atrim=start=${clip.sourceStart}:end=${clip.sourceEnd},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${volume}[aclip${index}]`);
      mixLabels.push(`[aclip${index}]`);
    });
    chains.push(`[${audio}]${mixLabels.join("")}amix=inputs=${1 + audioClips.length}:duration=first:normalize=0[amixed]`);
    audio = "amixed";
  }
  return { chains, extraInputs, outputDuration, finalVideo, finalAudio: audio };
}

/**
 * Render an editable sequence for the Video Editor Studio. Each segment can
 * reference a slice of an uploaded video; neighbouring segments are joined by
 * their own transition — a hard cut or any xfade in lib/transitions.ts. Audio
 * follows the same edit so the preview and exported video agree.
 */
export async function renderFadeSequence(inputs: string[], out: string, options: FadeSequenceOptions = {}): Promise<void> {
  if (inputs.length === 0) throw new Error("Add at least one video segment.");
  const metadata = await Promise.all(inputs.map(probe));
  const segments: ResolvedFadeSegment[] = inputs.map((_, index) => {
    const source = options.segments?.[index] ?? {};
    const duration = metadata[index].duration_s ?? 0;
    const start = Math.max(0, Math.min(duration, Number(source.start_s) || 0));
    const requestedEnd = Number(source.end_s);
    const end = Number.isFinite(requestedEnd) && requestedEnd > start ? Math.min(duration, requestedEnd) : duration;
    if (end <= start) throw new Error("One of the video segments has no playable duration.");
    const cropX = Number(source.crop?.x);
    const cropY = Number(source.crop?.y);
    const volume = Number(source.volume);
    const gapBefore = Math.min(60, Math.max(0, Number(source.gap_before_s) || 0));
    return { start, end, duration: end - start, gapBefore, hasAudio: metadata[index].has_audio, volume: Number.isFinite(volume) ? Math.min(2, Math.max(0, volume)) : 1, crop: { x: Number.isFinite(cropX) ? Math.min(1, Math.max(0, cropX)) : 0.5, y: Number.isFinite(cropY) ? Math.min(1, Math.max(0, cropY)) : 0.5 } };
  });
  const { chains, extraInputs, finalVideo, finalAudio } = buildFadeFilterGraph(segments, options);
  await runFfmpeg([
    ...inputs.flatMap((input) => ["-i", input]),
    ...extraInputs.flatMap((extra) => extra.kind === "file" ? ["-i", extra.path] : ["-f", "lavfi", "-i", extra.spec]),
    "-filter_complex", chains.join(";"),
    "-map", `[${finalVideo}]`, "-map", `[${finalAudio}]`,
    ...ENCODE, out,
  ]);
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
