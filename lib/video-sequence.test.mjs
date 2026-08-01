// Runnable check for the two pieces of Video Editor Studio logic that would
// fail silently: the timeline offsets the playhead uses, and the per-seam
// wiring of the ffmpeg filtergraph. If these drift apart, the editor preview
// stops matching the exported video and nobody sees an error.
//
//   node --test lib/video-sequence.test.mjs
//
// buildFilterGraph is re-implemented here rather than imported, because
// lib/ffmpeg.ts is TypeScript that node --test cannot load without a build
// step. Keep the two in sync — see lib/ffmpeg.ts buildFilterGraph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Mirrors fadeTransitionOverlaps/fadeSegmentOffsets in components/studio.tsx. */
function timelineOffsets(segments) {
  const offsets = [];
  let elapsed = 0;
  let outputDuration = segments[0].duration + (segments[0].gapBefore ?? 0);
  for (let index = 0; index < segments.length; index++) {
    const gap = segments[index].gapBefore ?? 0;
    elapsed += gap;
    let overlap = 0;
    if (index > 0) {
      const seam = segments[index].seam;
      overlap = seam.type === "cut" || gap > 0
        ? 0
        : Math.min(Math.max(0.1, seam.duration), Math.max(0.05, Math.min(outputDuration, segments[index].duration) / 2));
      outputDuration += gap + segments[index].duration - overlap;
      elapsed -= overlap;
    }
    offsets.push(Number(elapsed.toFixed(4)));
    elapsed += segments[index].duration;
  }
  return { offsets, total: Number((offsets.at(-1) + segments.at(-1).duration).toFixed(4)) };
}

test("each seam contributes its own overlap to the timeline", () => {
  // 10s + 10s + 10s, joined by a 1s crossfade then a hard cut.
  const { offsets, total } = timelineOffsets([
    { duration: 10, seam: null },
    { duration: 10, seam: { type: "circleopen", duration: 1 } },
    { duration: 10, seam: { type: "cut", duration: 1 } },
  ]);
  assert.deepEqual(offsets, [0, 9, 19], "clip 2 starts 1s early, clip 3 butts up against it");
  assert.equal(total, 29, "only the one transition shortens the sequence");

  // A seam can never eat more than half the shorter neighbour.
  const clamped = timelineOffsets([
    { duration: 10, seam: null },
    { duration: 1, seam: { type: "fade", duration: 2 } },
  ]);
  assert.equal(clamped.offsets[1], 9.5, "2s requested, clamped to half of the 1s clip");
});

test("blank gaps occupy real timeline time and disable seam overlap", () => {
  const { offsets, total } = timelineOffsets([
    { duration: 5, gapBefore: 1, seam: null },
    { duration: 5, gapBefore: 2, seam: { type: "fade", duration: 1 } },
  ]);
  assert.deepEqual(offsets, [1, 8]);
  assert.equal(total, 13);
});

test("the filtergraph gives every seam its own transition", async () => {
  const { buildFilterGraph } = await import("./ffmpeg.ts");
  const clip = { start: 0, end: 10, duration: 10, hasAudio: true, volume: 1, crop: { x: 0.5, y: 0.5 } };
  const { chains, outputDuration } = buildFilterGraph([clip, clip, clip], {
    transitions: [
      { type: "cut", duration: 0.5 },        // index 0 is the opening — "cut" means no fade-in
      { type: "circleopen", duration: 1 },
      { type: "slideright", duration: 0.6 },
    ],
    width: 640,
    height: 360,
  });
  const xfades = chains.filter((chain) => chain.includes("xfade="));

  assert.equal(xfades.length, 2, "one xfade per seam");
  assert.match(xfades[0], /xfade=transition=circleopen:duration=1:offset=9/);
  assert.match(xfades[1], /xfade=transition=slideright:duration=0.6:offset=18.4/);
  assert.equal(outputDuration, 28.4, "30s of clips less the 1s and 0.6s overlaps");

  // A hard cut in the middle must concat, not cross-fade.
  const withCut = buildFilterGraph([clip, clip], { transitions: [null, { type: "cut", duration: 1 }] });
  assert.equal(withCut.chains.filter((chain) => chain.includes("xfade=")).length, 0);
  assert.equal(withCut.outputDuration, 20);
});

test("the filtergraph renders blank gaps as black video and silence", async () => {
  const { buildFilterGraph } = await import("./ffmpeg.ts");
  const clip = { start: 0, end: 5, duration: 5, hasAudio: true, volume: 1, crop: { x: 0.5, y: 0.5 } };
  const second = { ...clip, gapBefore: 2 };
  const { chains, extraInputs, outputDuration } = buildFilterGraph([clip, second], {
    transitions: [{ type: "cut", duration: 0.5 }, { type: "fade", duration: 1 }],
    width: 640,
    height: 360,
  });
  assert.equal(outputDuration, 12);
  assert.equal(extraInputs.filter((input) => input.kind === "lavfi").length, 1);
  assert.ok(chains.some((chain) => chain.includes("anullsrc=") && chain.includes("duration=2")));
  assert.ok(chains.some((chain) => chain.includes("concat=n=3:v=1:a=0")));
  assert.equal(chains.filter((chain) => chain.includes("xfade=")).length, 0, "a real gap replaces the incoming transition");
});

test("caption is never baked into the video — it's post text, not a render option", async () => {
  const ffmpegSource = readFileSync(new URL("./ffmpeg.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ffmpegSource, /captionPng/, "buildFilterGraph/SequenceOptions must not accept a caption overlay again");
  const studioSource = readFileSync(new URL("./studio.ts", import.meta.url), "utf8");
  // Slideshow's own per-slide `slide.caption_media_id`/`s.caption_media_id` is
  // a different feature (baking hook text onto a photo) and must stay —
  // only the fade-in-specific `input.caption_media_id`/`params.caption_media_id`
  // (a whole-video overlay) is what got removed.
  assert.doesNotMatch(studioSource, /(input|params)\.caption_media_id/, "the fade-in render path must not read/write caption_media_id");
  assert.match(studioSource, /s\.caption_media_id|slide\.caption_media_id/, "slideshow's own per-slide caption overlay must be untouched");
});

test("Captions-timeline text overlays composite with a time-gated overlay filter, not drawtext", async () => {
  const { buildFilterGraph } = await import("./ffmpeg.ts");
  const clip = { start: 0, end: 10, duration: 10, hasAudio: true, volume: 1, crop: { x: 0.5, y: 0.5 } };
  const { chains, extraInputs } = buildFilterGraph([clip], {
    width: 1080,
    height: 1920,
    captions: [{ path: "/tmp/caption-0.png", x: 50, y: 80, width: 60, start: 1, end: 3 }],
  });
  assert.equal(extraInputs.length, 1);
  assert.equal(extraInputs[0].kind, "file");
  assert.equal(extraInputs[0].path, "/tmp/caption-0.png");
  const scaleChain = chains.find((chain) => chain.startsWith("[1:v]scale="));
  assert.match(scaleChain, /scale=648:-1\[cap0\]/, "648 = 1080 * 60% — the PNG scales relative to THIS render's own output width");
  const overlayChain = chains.find((chain) => chain.includes("overlay=x="));
  assert.match(overlayChain, /overlay=x=W\*0\.5000-w\/2:y=H\*0\.8000-h\/2:enable='between\(t,1\.000,3\.000\)'/, "position is center-anchored via ffmpeg's own W\\/H (base) and w\\/h (scaled overlay) so it's correct regardless of output resolution, and only visible during [start,end]");

  const none = buildFilterGraph([clip], {});
  assert.equal(none.extraInputs.length, 0, "no captions option means no overlay chain at all");
});

test("visual layers preserve row stacking, transforms, timing, and chroma key settings", async () => {
  const { buildFilterGraph } = await import("./ffmpeg.ts");
  const clip = { start: 0, end: 10, duration: 10, hasAudio: true, volume: 1, crop: { x: 0.5, y: 0.5 } };
  const { chains, extraInputs } = buildFilterGraph([clip], {
    width: 1080,
    height: 1920,
    visualLayers: [
      { path: "/tmp/top.png", row: 0, x: 25, y: 30, width: 20, start: 2, end: 5 },
      { path: "/tmp/keyed.gif", row: 1, x: 50, y: 50, width: 40, start: 1, end: 8, chroma: { enabled: true, color: "#00ff00", similarity: 0.3, blend: 0.08 } },
    ],
  });
  assert.deepEqual(extraInputs.map((input) => input.path), ["/tmp/keyed.gif", "/tmp/top.png"], "lower row numbers are composited last and therefore remain visually on top");
  assert.ok(extraInputs.every((input) => input.loop), "visual inputs loop for their complete timeline window");
  assert.ok(chains.some((chain) => chain.includes("colorkey=0x00ff00:0.300:0.080")), "green-screen settings reach ffmpeg's colorkey filter");
  assert.ok(chains.some((chain) => chain.includes("scale=216:-1") && chain.includes("PTS-STARTPTS+2.000/TB")), "20% width and the layer start are applied to the top layer");
  assert.ok(chains.some((chain) => chain.includes("x=W*0.2500-w/2:y=H*0.3000-h/2") && chain.includes("between(t,2.000,5.000)")), "position and visibility window are center anchored in output coordinates");
});

test("every audio clip (soundtrack or detached clip audio) gets its own trimmed, delayed input mixed into the bus", async () => {
  const { buildFilterGraph } = await import("./ffmpeg.ts");
  const clip = { start: 0, end: 10, duration: 10, hasAudio: true, volume: 1, crop: { x: 0.5, y: 0.5 } };
  const { chains, extraInputs } = buildFilterGraph([clip], {
    audioClips: [
      { path: "/tmp/soundtrack.mp3", sourceStart: 2, sourceEnd: 8, start: 1.5, volume: 0.8 },
      { path: "/tmp/detached-clip-audio.mp4", sourceStart: 0, sourceEnd: 4, start: 6, volume: 1 },
    ],
  });
  assert.equal(extraInputs.length, 2);
  assert.deepEqual(extraInputs.map((i) => i.path), ["/tmp/soundtrack.mp3", "/tmp/detached-clip-audio.mp4"]);

  const clip0Chain = chains.find((chain) => chain.startsWith("[1:a]"));
  assert.match(clip0Chain, /atrim=start=2:end=8,asetpts=PTS-STARTPTS,adelay=1500\|1500,volume=0\.8\[aclip0\]/, "1500ms delay = 1.5s start position; trims to its OWN source window, independent of the video's");
  const clip1Chain = chains.find((chain) => chain.startsWith("[2:a]"));
  assert.match(clip1Chain, /atrim=start=0:end=4,asetpts=PTS-STARTPTS,adelay=6000\|6000,volume=1\[aclip1\]/);

  const mixChain = chains.find((chain) => chain.includes("amix="));
  assert.match(mixChain, /\[a0\]\[aclip0\]\[aclip1\]amix=inputs=3:duration=first:normalize=0\[amixed\]/, "the main bus plus both clips, capped to the main bus's own duration");

  const none = buildFilterGraph([clip], {});
  assert.equal(none.chains.some((chain) => chain.includes("amix=")), false, "no audioClips means no mix chain at all");
});

test("opening and closing fade to/from a synthesized black clip without changing duration", async () => {
  const { buildFilterGraph } = await import("./ffmpeg.ts");
  const clip = { start: 0, end: 10, duration: 10, hasAudio: true, volume: 1, crop: { x: 0.5, y: 0.5 } };

  // No opening/closing requested ("cut", or omitted): no black source at all.
  const plain = buildFilterGraph([clip], { transitions: [{ type: "cut", duration: 0.5 }] });
  assert.equal(plain.extraInputs.length, 0, "a plain sequence should never synthesize black");
  assert.equal(plain.outputDuration, 10);

  // Opening: xfade at offset 0 against black, duration unaffected.
  const opened = buildFilterGraph([clip], { transitions: [{ type: "wipeleft", duration: 0.7 }] });
  assert.equal(opened.extraInputs.length, 1);
  assert.equal(opened.extraInputs[0].kind, "lavfi");
  assert.match(opened.extraInputs[0].spec, /^color=c=black:/);
  const openXfade = opened.chains.find((chain) => chain.includes("xfade="));
  assert.match(openXfade, /\[vblackopen\]\[v0\]xfade=transition=wipeleft:duration=0\.7:offset=0\[vopened\]/);
  assert.equal(opened.outputDuration, 10, "the opening must not add or remove length");

  // Closing: xfade at offset (duration - closeDur) against black, duration unaffected.
  const closed = buildFilterGraph([clip], { closing: { type: "circleclose", duration: 0.4 } });
  assert.equal(closed.extraInputs.length, 1);
  assert.equal(closed.extraInputs[0].kind, "lavfi");
  const closeXfade = closed.chains.find((chain) => chain.includes("xfade="));
  assert.match(closeXfade, /xfade=transition=circleclose:duration=0\.4:offset=9\.6\[vclosed\]/);
  assert.equal(closed.outputDuration, 10, "the closing must not add or remove length");
  assert.equal(closed.finalVideo, "vclosed");

  // A transition longer than half the clip must clamp, or it runs the xfade
  // past the source frames it has to blend.
  const clampedOpen = buildFilterGraph([clip], { transitions: [{ type: "fade", duration: 2 }] });
  const clampedXfade = clampedOpen.chains.find((chain) => chain.includes("xfade="));
  assert.match(clampedXfade, /duration=2\b/, "2s is under half of the 10s clip, so it should NOT clamp here");
  const shortClip = { ...clip, end: 1, duration: 1 };
  const clampedShort = buildFilterGraph([shortClip], { transitions: [{ type: "fade", duration: 2 }] });
  const clampedShortXfade = clampedShort.chains.find((chain) => chain.includes("xfade="));
  assert.match(clampedShortXfade, /duration=0\.5\b/, "2s requested on a 1s clip must clamp to half its length");
});

const ffmpeg = (args) => execFileSync(process.env.FFMPEG_PATH ?? "ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const haveFfmpeg = (() => { try { ffmpeg(["-version"]); return true; } catch { return false; } })();

// Runs the real renderFilmstrip, for two reasons: its filter quotes commas
// inside crop='min(iw,ih)' so ffmpeg's own parser doesn't read them as filter
// separators (easy to "tidy" into something broken, and it only fails at
// request time); and the editor infers the frame count from the image's aspect
// ratio, so square tiles and an exact width are load-bearing, not cosmetic.
test("renderFilmstrip emits square tiles the editor can index", { skip: haveFfmpeg ? false : "ffmpeg not installed" }, async () => {
  const { renderFilmstrip, filmstripFrameCount } = await import("./ffmpeg.ts");
  const dir = mkdtempSync(join(tmpdir(), "pt-filmstrip-test-"));
  try {
    const dims = async (seconds) => {
      const clip = join(dir, `clip-${seconds}.mp4`);
      const strip = join(dir, `strip-${seconds}.jpg`);
      ffmpeg(["-f", "lavfi", "-i", `testsrc=size=640x360:duration=${seconds}:rate=30`, "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
      await renderFilmstrip(clip, strip);
      const [width, height] = execFileSync(process.env.FFPROBE_PATH ?? "ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", strip]).toString().trim().split(",").map(Number);
      return { width, height };
    };

    const short = await dims(4);
    assert.equal(short.width / short.height, filmstripFrameCount(4), "frame count must be readable from the aspect ratio");

    // Longer clips get more frames, or trimming a few seconds would never
    // cross a slice boundary and the visible frames would not change.
    const long = await dims(30);
    assert.equal(long.width / long.height, filmstripFrameCount(30));
    assert.ok(filmstripFrameCount(30) > filmstripFrameCount(4), "frame count must scale with duration");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the transition catalog only offers ids ffmpeg accepts", () => {
  const catalog = readFileSync(new URL("./transitions.ts", import.meta.url), "utf8");
  const ids = [...catalog.matchAll(/^\s*\{ id: "([a-z]+)"/gm)].map((match) => match[1]);
  assert.ok(ids.length >= 20, `expected a real catalog, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate transition id");
  // Every id except our own "cut" must be a real xfade value. Verify with:
  //   ffmpeg -hide_banner -h filter=xfade
  const XFADE = new Set(["fade", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft", "slideright", "slideup", "slidedown", "circlecrop", "rectcrop", "distance", "fadeblack", "fadewhite", "radial", "smoothleft", "smoothright", "smoothup", "smoothdown", "circleopen", "circleclose", "vertopen", "vertclose", "horzopen", "horzclose", "dissolve", "pixelize", "diagtl", "diagtr", "diagbl", "diagbr", "hlslice", "hrslice", "vuslice", "vdslice", "hblur", "fadegrays", "wipetl", "wipetr", "wipebl", "wipebr", "squeezeh", "squeezev", "zoomin", "fadefast", "fadeslow", "hlwind", "hrwind", "vuwind", "vdwind"]);
  for (const id of ids) {
    if (id === "cut") continue;
    assert.ok(XFADE.has(id), `"${id}" is not an ffmpeg xfade transition`);
  }
});
