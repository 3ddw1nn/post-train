"use client";

// Content Studio wizards + job list. Jobs are created via
// POST /api/app/studio/jobs and advanced by the server worker; this UI polls
// the list while any job is still running (same polling idiom as support chat).
import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./icons";
import { Select } from "./interactive";
import { AccountAvatar, PlatformIcon } from "./platform-icon";
import { MediaLibraryModal, MediaThumb, uploadOneFile, type ComposerMedia } from "./media";
import { platform as platformOf, CAPTION_MAX_BY_PLATFORM, CAPTION_MAX as PLATFORM_CAPTION_MAX } from "@/lib/platforms";
import { checkAiTone, type AiToneResult } from "@/lib/ai-tone";
import type { StudioDraftRow } from "@/lib/studio-drafts";
import { VIDEO_ASPECTS, VIDEO_PRESETS, type VideoAspect, type VideoPresetId } from "@/lib/video-render-settings";
import {
  DEFAULT_TRANSITION_DURATION,
  DEFAULT_TRANSITION_ID,
  TRANSITIONS,
  TRANSITION_DURATION_MAX,
  TRANSITION_DURATION_MIN,
  TRANSITION_GROUPS,
  clampTransitionDuration,
  transitionById,
  transitionLabel,
  transitionPreviewStyles,
  type TransitionGroup,
  type TransitionId,
} from "@/lib/transitions";
import { clamp, hexToRgba as fadeHexToRgba } from "@/lib/color";
import { localDateInputValue, nextMinuteInputValue, isPastSchedule, isPastToday } from "@/lib/format";
import { StudioChooseScreen, StudioCtaCard } from "./studio-choose-screen";
import { useEditGuard } from "./edit-guard";
import { CaptionCopyButton } from "./caption-copy-button";

type StudioJob = {
  id: string;
  template: "grid-2x2" | "fade-in" | "ai-ugc" | "slideshow";
  status: "queued" | "generating" | "compositing" | "done" | "failed";
  output_media_id: string | null;
  output_media_ids: string | null;
  error_message: string | null;
  created_at: string;
};

type Persona = {
  id: string;
  name: string;
  preview_image_url: string | null;
  source: "stock";
  is_demo?: boolean;
};

const TEMPLATE_LABEL: Record<StudioJob["template"], string> = {
  "grid-2x2": "2x2 Grid Video",
  "fade-in": "Video Editor",
  "ai-ugc": "AI UGC Video Studio",
  slideshow: "Slideshow",
};

const STATUS_LABEL: Record<StudioJob["status"], string> = {
  queued: "Queued",
  generating: "Generating…",
  compositing: "Rendering…",
  done: "Ready",
  failed: "Failed",
};

const SCRIPT_MAX = 600;
const CAPTION_MAX = 200;
const SLIDE_TEXT_MAX = 120;
const SLIDE_MAX = 10;
const CAPTION_LENGTHS = [
  ["short", "Short"],
  ["medium", "Medium"],
  ["long", "Long"],
] as const;

/** Mirrors estimateAiUgcCost in lib/studio.ts (speech ≈ 15 chars/second). */
function estimateSeconds(chars: number) {
  return Math.min(60, Math.max(5, Math.round(chars / 15)));
}

/* ---------------------------------- slots ---------------------------------- */

function ClipSlot({
  label,
  media,
  onChange,
  kind,
  accept,
}: {
  label: string;
  media: ComposerMedia | null;
  onChange: (m: ComposerMedia | null) => void;
  kind: "video" | "image";
  accept: string;
}) {
  const [libOpen, setLibOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setErr(null);
    setBusy(true);
    try {
      onChange(await uploadOneFile(file));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      {media ? (
        <div className="mt-2 flex items-center gap-2">
          <MediaThumb media={media} size={72} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{media.name}</p>
            <button
              type="button"
              className="mt-1 text-xs text-muted underline"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn-subtle flex-1 !py-1.5 text-sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" size={14} /> {busy ? "Uploading…" : "Upload"}
          </button>
          <button
            type="button"
            className="btn-subtle flex-1 !py-1.5 text-sm"
            disabled={busy}
            onClick={() => setLibOpen(true)}
          >
            <Icon name="image" size={14} /> Library
          </button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {libOpen && (
        <MediaLibraryModal
          kind={kind}
          onClose={() => setLibOpen(false)}
          onPick={(m) => {
            onChange(m);
            setLibOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------- caption → transparent PNG ------------------------ */

// The caption overlay is rasterized in the browser (full font/emoji support)
// and composited server-side with ffmpeg's `overlay` — slim ffmpeg builds
// don't ship drawtext/freetype.
async function captionToPngFile(text: string): Promise<File> {
  const width = 980;
  const font = "bold 64px -apple-system, 'Segoe UI', Roboto, sans-serif";
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d")!;
  ctx.font = font;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width - 40) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  const lineHeight = 80;
  canvas.width = width;
  canvas.height = Math.max(1, lines.length) * lineHeight + 24;
  ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#ffffff";
  lines.forEach((line, i) => {
    const y = 12 + i * lineHeight + lineHeight / 2;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Caption render failed"))), "image/png")
  );
  return new File([blob], "caption.png", { type: "image/png" });
}

/* --------------------------- captions timeline overlay --------------------------- */

// Text overlays positioned/timed on the Video Editor's own timeline — a
// separate feature from the plain-text `caption` above (post text, never
// rendered). These ARE baked into the exported video. The type/interaction
// model is duplicated from slideshow-studio.tsx's TextLayer/LayerView/drawLayer
// rather than shared, since the two features diverge immediately (time range
// vs. per-slide, one set shared across every platform vs. per-platform
// overrides) — each Studio stays self-contained, same as FadeCropModal
// duplicating ImageCropModal's concept independently.
const FADE_FONTS = [
  { id: "sans", name: "Sans", stack: "-apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "serif", name: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", name: "Mono", stack: "ui-monospace, Menlo, Consolas, monospace" },
  { id: "condensed", name: "Condensed", stack: "'Arial Narrow', 'Roboto Condensed', sans-serif" },
  { id: "rounded", name: "Rounded", stack: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: "impact", name: "Impact", stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
] as const;
const FADE_TEXT_STYLES = [
  { id: "shadow", name: "Shadow", className: "text-white [text-shadow:0_0.06em_0_rgba(0,0,0,0.85)]", fill: "#ffffff", effect: "shadow" },
  { id: "light", name: "Light", className: "text-white", fill: "#ffffff", effect: "none" },
  { id: "dark", name: "Dark", className: "text-ink", fill: "#1c1c1e", effect: "none" },
  { id: "outline", name: "Outline", className: "text-white [text-shadow:-0.035em_-0.035em_0_#000,0.035em_-0.035em_0_#000,-0.035em_0.035em_0_#000,0.035em_0.035em_0_#000]", fill: "#ffffff", effect: "outline" },
  { id: "pop", name: "Pop", className: "text-[#ffd63b] [text-shadow:0_0.06em_0_rgba(0,0,0,0.9)]", fill: "#ffd63b", effect: "shadow" },
] as const;

type FadeTextLayer = {
  id: string;
  text: string;
  x: number; y: number; width: number; // center position / wrap width, percent of frame
  scale: number; font: string; style: string;
  /** Text fill color — independent of `style`, which only drives the
   *  shadow/outline/none effect. Falls back to the style's own default fill
   *  for layers created before this field existed. */
  color?: string;
  bgEnabled: boolean; bgColor: string; bgOpacity: number;
  start: number; end: number; // seconds, same coordinate space as previewTime/timelineDuration
  /** Preferred visual row in the text overlay stack, same idea as
   *  FadeAudioClip.row — rendering and export ignore this. */
  row?: number;
  /** The overlay PNG last uploaded for this layer, reused across re-renders
   *  as long as fadeCaptionRenderSignature hasn't changed since. */
  renderedMediaId?: string;
  renderedSignature?: string;
};
function fadeLayerFont(layer: FadeTextLayer) {
  return FADE_FONTS.find((f) => f.id === layer.font) ?? FADE_FONTS[0];
}
function fadeLayerStyle(layer: FadeTextLayer) {
  return FADE_TEXT_STYLES.find((s) => s.id === layer.style) ?? FADE_TEXT_STYLES[0];
}
// Video captions read much smaller than slideshow's hero text at the same
// cqw scale (a slide is one big static hook line; a caption is a subtitle
// that shouldn't cover the shot) — so these run well below slideshow's own
// TEXT_SCALE_MIN/MAX/DEFAULT (4/14/8) rather than reusing them.
const FADE_CAPTION_SCALE_MIN = 1;
const FADE_CAPTION_SCALE_MAX = 12;
const FADE_CAPTION_SCALE_DEFAULT = 3;
const FADE_CAPTION_SIZE_PRESETS = [
  { id: "small", name: "Small", scale: 2 },
  { id: "medium", name: "Medium", scale: 3 },
  { id: "large", name: "Large", scale: 5 },
] as const;
const FADE_CAPTION_COLOR_DEFAULT = "#ffffff";
function makeFadeTextLayer(overrides: Partial<FadeTextLayer> = {}): FadeTextLayer {
  return {
    id: crypto.randomUUID(),
    text: "",
    x: 50, y: 80, width: 70,
    scale: FADE_CAPTION_SCALE_DEFAULT, font: "sans", style: "shadow", color: FADE_CAPTION_COLOR_DEFAULT,
    bgEnabled: true, bgColor: "#000000", bgOpacity: 100,
    start: 0, end: 3,
    ...overrides,
  };
}
/** Fields that change what gets drawn onto the overlay PNG — used to decide
 *  whether a cached upload can be reused instead of re-rasterizing/uploading. */
function fadeCaptionRenderSignature(layer: FadeTextLayer): string {
  return JSON.stringify({ text: layer.text, width: layer.width, scale: layer.scale, font: layer.font, style: layer.style, color: layer.color, bgEnabled: layer.bgEnabled, bgColor: layer.bgColor, bgOpacity: layer.bgOpacity });
}
// A fixed reference frame width, independent of any platform's actual output
// resolution — ffmpeg's overlay filter scales the resulting PNG to each
// platform's real width at render time (see buildFadeFilterGraph), the same
// way the old single-caption overlay used a fixed 980px reference.
const FADE_CAPTION_REFERENCE_WIDTH = 1080;
/** Rasterize one caption layer onto a transparent PNG sized to just its own
 *  box (matching drawLayer's DOM-equivalent look in slideshow-studio.tsx) —
 *  x/y placement onto the actual video happens server-side via the overlay
 *  filter's position expression, not here. */
async function renderFadeCaptionBlob(layer: FadeTextLayer): Promise<Blob> {
  const w = Math.max(2, Math.round((layer.width / 100) * FADE_CAPTION_REFERENCE_WIDTH));
  const st = fadeLayerStyle(layer);
  const font = fadeLayerFont(layer);
  const fontSize = (layer.scale / 100) * FADE_CAPTION_REFERENCE_WIDTH;
  const hPad = fontSize * 0.3;
  const vPad = fontSize * 0.15;
  const innerMax = w - hPad * 2;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `900 ${fontSize}px ${font.stack}`;
  const lines: string[] = [];
  for (const para of layer.text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure.measureText(candidate).width > innerMax) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  const lineHeight = fontSize * 1.25;
  const blockH = lines.length * lineHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = Math.max(2, Math.ceil(blockH + vPad * 2));
  const ctx = canvas.getContext("2d")!;
  ctx.font = `900 ${fontSize}px ${font.stack}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = w / 2;

  if (layer.bgEnabled) {
    let maxLineW = 0;
    for (const ln of lines) maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
    const boxW = maxLineW + hPad * 2;
    ctx.fillStyle = fadeHexToRgba(layer.bgColor, layer.bgOpacity ?? 100);
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, 0, boxW, canvas.height, fontSize * 0.15);
    ctx.fill();
  }

  lines.forEach((ln, i) => {
    const y = vPad + i * lineHeight + lineHeight / 2;
    ctx.save();
    if (st.effect === "shadow") {
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowOffsetY = fontSize * 0.13;
    } else if (st.effect === "outline") {
      ctx.lineJoin = "round";
      ctx.lineWidth = fontSize * 0.14;
      ctx.strokeStyle = "#000000";
      ctx.strokeText(ln, cx, y);
    }
    ctx.fillStyle = layer.color || st.fill;
    ctx.fillText(ln, cx, y);
    ctx.restore();
  });

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Caption render failed"))), "image/png"),
  );
}

/* ------------------------------ audio clips -------------------------------- */

// One shared shape for both the uploaded soundtrack and any clip audio the
// user has detached from its video — both need identical drag/trim/delete/
// volume mechanics, just live in different timeline rows and carry a
// different `kind` label for that reason.
type FadeAudioClip = {
  id: string;
  kind: "soundtrack" | "detached";
  mediaId: string;
  name: string;
  sourceStart: number; sourceEnd: number; // trim window within the source file
  start: number; end: number; // position in the composed OUTPUT timeline — end-start === sourceEnd-sourceStart, always
  volume: number;
  /** Preferred visual row in the independent audio stack. Rendering and
   * export ignore this; it only preserves the editor layout across drafts. */
  row?: number;
  /** The segment this was detached from — used only to hide that segment's
   *  box from the Original clip audio row. The clip is otherwise fully
   *  independent: if that segment is later edited or deleted, this stays. */
  sourceSegmentId?: string;
};
/** Reads a local File's duration directly (no network round-trip needed) —
 *  used to seed a freshly-uploaded soundtrack's default trim window. */
function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { resolve(audio.duration || 0); URL.revokeObjectURL(audio.src); };
    audio.onerror = () => { resolve(0); URL.revokeObjectURL(audio.src); };
    audio.src = URL.createObjectURL(file);
  });
}

/* --------------------------------- wizard ---------------------------------- */

export function StudioWizard({
  template,
  avatarPerSecond,
  aiUsed,
  aiCap,
  initialSlideTexts,
  sourceExploreItemId,
}: {
  template: StudioJob["template"];
  avatarPerSecond: number;
  aiUsed: number;
  aiCap: number;
  initialSlideTexts?: string[];
  sourceExploreItemId?: string;
}) {
  const router = useRouter();
  const [clips, setClips] = useState<(ComposerMedia | null)[]>(
    template === "grid-2x2" ? [null, null, null, null] : [null]
  );
  const fixedSlideCount = !!initialSlideTexts;
  const [slideImages, setSlideImages] = useState<(ComposerMedia | null)[]>(
    template === "slideshow" ? Array(initialSlideTexts?.length ?? 3).fill(null) : []
  );
  const [slideTexts, setSlideTexts] = useState<string[]>(
    template === "slideshow" ? (initialSlideTexts ?? Array(3).fill("")) : []
  );
  const [caption, setCaption] = useState("");
  const [script, setScript] = useState("");
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [personaTab, setPersonaTab] = useState<"stock" | "custom">("stock");
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [personaImage, setPersonaImage] = useState<ComposerMedia | null>(null);
  const [cta, setCta] = useState<ComposerMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (template !== "ai-ugc") return;
    fetch("/api/app/studio/personas")
      .then((r) => r.json())
      .then((d) => setPersonas(d.data ?? []))
      .catch(() => setPersonas([]));
  }, [template]);

  const mockMode = personas?.some((p) => p.is_demo) ?? false;
  const seconds = estimateSeconds(script.length);
  const aiLeft = Math.max(0, aiCap - aiUsed);

  function addSlide() {
    if (slideImages.length >= SLIDE_MAX) return;
    setSlideImages((s) => [...s, null]);
    setSlideTexts((t) => [...t, ""]);
  }
  function removeSlide(i: number) {
    if (slideImages.length <= 1) return;
    setSlideImages((s) => s.filter((_, j) => j !== i));
    setSlideTexts((t) => t.filter((_, j) => j !== i));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { template };
      if (template === "grid-2x2" || template === "fade-in") {
        const ids = clips.filter(Boolean).map((m) => m!.id);
        if (ids.length !== clips.length) throw new Error("Add all clips first.");
        body.media_ids = ids;
        if (template === "fade-in" && caption.trim()) {
          body.caption = caption.trim();
          const png = await uploadOneFile(await captionToPngFile(caption.trim()));
          body.caption_media_id = png.id;
        }
      } else if (template === "slideshow") {
        const ids = slideImages.filter(Boolean).map((m) => m!.id);
        if (ids.length !== slideImages.length) throw new Error("Add a photo for every slide first.");
        const slides = [];
        for (let i = 0; i < slideImages.length; i++) {
          const text = slideTexts[i]?.trim() ?? "";
          const slide: Record<string, unknown> = { image_media_id: slideImages[i]!.id };
          if (text) {
            const png = await uploadOneFile(await captionToPngFile(text));
            slide.caption_media_id = png.id;
          }
          slides.push(slide);
        }
        body.slides = slides;
        if (sourceExploreItemId) body.source_explore_item_id = sourceExploreItemId;
      } else {
        body.script = script.trim();
        if (personaTab === "stock") {
          const persona = personas?.find((p) => p.id === personaId);
          if (!persona) throw new Error("Pick a persona.");
          body.persona = { source: "stock", id: persona.id, name: persona.name };
        } else {
          if (!personaImage) throw new Error("Upload a persona image.");
          body.persona = { source: "custom", image_media_id: personaImage.id };
        }
        if (cta) body.cta_media_id = cta.id;
      }
      const res = await fetch("/api/app/studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Could not start the job.");
      router.push("/dashboard/content-studio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the job.");
      setBusy(false);
    }
  }

  const ready =
    template === "ai-ugc"
      ? script.trim().length > 0 &&
        (personaTab === "stock" ? !!personaId : !!personaImage) &&
        aiLeft > 0
      : template === "slideshow"
        ? slideImages.every(Boolean)
        : clips.every(Boolean);

  return (
    <div className="fade-up">
      <div className="card mx-auto max-w-2xl p-6">
        <Link href="/dashboard/content-studio" className="text-sm text-muted hover:underline">
          ← Content Studio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{TEMPLATE_LABEL[template]}</h1>

        {template === "grid-2x2" && (
          <>
            <p className="mt-1 text-sm text-muted">
              Pick four clips — they play together in a 2x2 grid (1080x1920). Audio comes from
              the first clip.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {clips.map((m, i) => (
                <ClipSlot
                  key={i}
                  label={`Clip ${i + 1}${i === 0 ? " (audio)" : ""}`}
                  media={m}
                  kind="video"
                  accept="video/*"
                  onChange={(v) => setClips((c) => c.map((x, j) => (j === i ? v : x)))}
                />
              ))}
            </div>
          </>
        )}

        {template === "fade-in" && (
          <>
            <p className="mt-1 text-sm text-muted">
              One clip with a clean 1s fade-in and an optional caption overlay.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <ClipSlot
                label="Clip"
                media={clips[0]}
                kind="video"
                accept="video/*"
                onChange={(v) => setClips([v])}
              />
              <div>
                <label className="text-xs font-semibold text-muted">Caption (optional)</label>
                <textarea
                  className="input mt-1 w-full"
                  rows={2}
                  maxLength={CAPTION_MAX}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="POV: you found the tool that posts everywhere for you"
                />
                <p className="text-right text-xs text-muted">
                  {caption.length}/{CAPTION_MAX}
                </p>
              </div>
            </div>
          </>
        )}

        {template === "slideshow" && (
          <>
            <p className="mt-1 text-sm text-muted">
              {fixedSlideCount
                ? "Drop in your own photo for each slide — the hook text carries over from the post you started from."
                : "Add 1-10 slides, each with your own photo and optional hook text."}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {slideImages.map((m, i) => (
                <div key={i} className="rounded-xl border border-dashed border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted">Slide {i + 1}</p>
                    {!fixedSlideCount && slideImages.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-muted underline"
                        onClick={() => removeSlide(i)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <ClipSlot
                      label="Photo"
                      media={m}
                      kind="image"
                      accept="image/*"
                      onChange={(v) => setSlideImages((s) => s.map((x, j) => (j === i ? v : x)))}
                    />
                  </div>
                  <textarea
                    className="input mt-2 w-full"
                    rows={2}
                    maxLength={SLIDE_TEXT_MAX}
                    value={slideTexts[i] ?? ""}
                    onChange={(e) =>
                      setSlideTexts((t) => t.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    placeholder="Hook text for this slide (optional)"
                  />
                </div>
              ))}
            </div>
            {!fixedSlideCount && slideImages.length < SLIDE_MAX && (
              <button
                type="button"
                className="btn-subtle mt-3 w-full !py-1.5 text-sm"
                onClick={addSlide}
              >
                <Icon name="plus" size={14} /> Add slide
              </button>
            )}
          </>
        )}

        {template === "ai-ugc" && (
          <>
            <p className="mt-1 text-sm text-muted">
              Pick a persona, write the hook they&apos;ll say, and optionally append a CTA or
              product clip at the end.
            </p>

            <div className="mt-4 flex gap-2">
              {(
                [
                  ["stock", "Stock personas"],
                  ["custom", "Your own image"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={personaTab === tab ? "btn-primary !py-1.5 text-sm" : "btn-subtle !py-1.5 text-sm"}
                  onClick={() => setPersonaTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {personaTab === "stock" ? (
              personas === null ? (
                <p className="py-8 text-center text-sm text-muted">Loading personas…</p>
              ) : (
                <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {personas.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonaId(p.id)}
                      className={`overflow-hidden rounded-xl border-2 text-left ${
                        personaId === p.id ? "border-primary" : "border-transparent"
                      }`}
                      title={p.name}
                    >
                      {p.preview_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.preview_image_url}
                          alt={p.name}
                          className="aspect-[9/16] w-full object-cover"
                        />
                      ) : (
                        <span className="flex aspect-[9/16] items-center justify-center bg-page text-muted">
                          <Icon name="users" size={22} />
                        </span>
                      )}
                      <span className="block truncate px-1.5 py-1 text-xs">{p.name}</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="mt-3">
                <ClipSlot
                  label="Persona image (a clear face photo works best)"
                  media={personaImage}
                  kind="image"
                  accept="image/*"
                  onChange={setPersonaImage}
                />
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-semibold text-muted">Hook / script</label>
              <textarea
                className="input mt-1 w-full"
                rows={4}
                maxLength={SCRIPT_MAX}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="I tried every scheduling app so you don't have to — this one actually posts for you…"
              />
              <p className="text-right text-xs text-muted">
                {script.length}/{SCRIPT_MAX}
              </p>
            </div>

            <div className="mt-2">
              <ClipSlot
                label="CTA / product clip (optional, appended at the end)"
                media={cta}
                kind="video"
                accept="video/*"
                onChange={setCta}
              />
            </div>

            {/* Price transparency — pay-as-you-go rates, no surprises. */}
            <div className="mt-4 rounded-xl bg-page p-3 text-xs text-muted">
              {mockMode ? (
                <p>
                  <b>Demo mode</b> — no provider keys configured, so generating renders a free
                  placeholder clip through the full pipeline.
                </p>
              ) : (
                <>
                  <p>
                    Estimated video length: <b>~{seconds}s</b> for this script.
                  </p>
                  {personaTab === "custom" ? (
                    <p className="mt-1">
                      Estimated generation cost: <b>≈ ${(seconds * avatarPerSecond).toFixed(2)}</b> at
                      ${avatarPerSecond}/second (720p AI avatar video).
                    </p>
                  ) : (
                    <p className="mt-1">
                      Estimated generation cost: <b>≈ ${(seconds * avatarPerSecond).toFixed(2)}</b> at
                      ${avatarPerSecond}/second (720p AI avatar video).
                    </p>
                  )}
                </>
              )}
              <p className="mt-1">
                {aiLeft} of {aiCap} AI generations left this month.
              </p>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          className="btn-primary mt-4 w-full"
          disabled={!ready || busy}
          onClick={submit}
        >
          {busy
            ? "Starting…"
            : template === "ai-ugc"
              ? "Generate video"
              : template === "slideshow"
                ? "Render slideshow"
                : "Render video"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------- video editor studio -------------------------- */

export type FadeInAccount = { id: number; platform: string; username: string; avatar_url: string | null };
type FadeJobStatus = "idle" | "queued" | "generating" | "compositing" | "done" | "failed";
type FadeTransition = TransitionId;

type FadeSeam = { type: TransitionId; duration: number };

/** Matches the server-side cap in createStudioJob (lib/studio.ts). */
const MAX_FADE_SEGMENTS = 8;

const UNTITLED_DRAFT_TITLE = "Untitled video";
/** Drafts saved under the studio's old name still use this as the "no title
 *  yet" sentinel, so keep recognising it when resuming one. */
const LEGACY_UNTITLED_DRAFT_TITLES = [UNTITLED_DRAFT_TITLE, "Untitled fade-in video"];

type FadeTimelineSegment = {
  id: string;
  media: ComposerMedia;
  start: number;
  end: number | null;
  duration: number | null;
  volume: number;
  /** Blank black/silent timeline space before this clip. A non-zero gap and
   * an incoming transition are mutually exclusive. */
  gapBefore?: number;
  audioRemoved?: boolean;
  crops: Record<string, { x: number; y: number }>;
  /** Transition into this clip: from the previous clip, or — on the first
   *  clip — from black (the "opening"). There's a symmetric `closingSeam` at
   *  the FadeVideoEditor level for fading the tail out to black, since there's
   *  no segment past the last one to hang it on. */
  transitionIn?: FadeSeam;
};

/** Drafts saved before per-seam transitions carry one whole-sequence setting.
 *  Segment 0 backfills from the old dedicated opening-fade field rather than
 *  the inter-clip fallback — those are semantically different settings. */
function withSeams(segments: FadeTimelineSegment[], fallback: FadeSeam, openingFallback: FadeSeam): FadeTimelineSegment[] {
  return segments.map((segment, index) => ({ ...segment, transitionIn: segment.transitionIn ?? (index === 0 ? openingFallback : fallback) }));
}

function segmentSeam(segment: FadeTimelineSegment | undefined): FadeSeam {
  return segment?.transitionIn ?? { type: DEFAULT_TRANSITION_ID, duration: DEFAULT_TRANSITION_DURATION };
}

type FadeDraftSnapshot = Partial<{
  step: number;
  campaignName: string;
  publishDate: string;
  publishTime: string;
  selectedAccountIds: number[];
  activePlatform: string;
  platformFormatIds: Record<string, string>;
  segments: FadeTimelineSegment[];
  transition: FadeTransition;
  transitionDuration: number;
  /** @deprecated superseded by segments[0].transitionIn — kept only so old drafts can be backfilled on resume, see withSeams. */
  fadeInDuration: number;
  closingSeam: FadeSeam;
  caption: string;
  platformOutputMediaIds: Record<string, string>;
  renderSignatures: Record<string, string>;
  captionLayers: FadeTextLayer[];
  audioClips: FadeAudioClip[];
  platformCaptions: Record<string, string>;
  captionLength: "short" | "medium" | "long";
}>;

type FadeEditorSnapshot = {
  segments: FadeTimelineSegment[];
  activeSegmentId: string | null;
  splitAt: number;
  transition: FadeTransition;
  transitionDuration: number;
  closingSeam: FadeSeam;
  captionLayers: FadeTextLayer[];
  audioClips: FadeAudioClip[];
};

type FadeFormatOption = { id: string; label: string; presetId: VideoPresetId; aspect: VideoAspect };
const FADE_DEFAULT_PRESET: VideoPresetId = "vertical-short";
function fadeFormatOptions(platformId: string): FadeFormatOption[] {
  return VIDEO_PRESETS.flatMap((preset) => preset.targets.filter((target) => target.platformId === platformId).map((target) => ({ id: `${preset.id}:${target.label}`, label: target.label, presetId: preset.id, aspect: preset.aspect })));
}
function fadeFormatFor(platformId: string, selections: Record<string, string>): FadeFormatOption {
  const options = fadeFormatOptions(platformId);
  return options.find((option) => option.id === selections[platformId]) ?? options.find((option) => option.aspect.id === "9:16") ?? options[0] ?? { id: `${platformId}:default`, label: platformOf(platformId)?.name ?? platformId, presetId: FADE_DEFAULT_PRESET, aspect: VIDEO_ASPECTS[0] };
}

function fadeSegmentDuration(segment: FadeTimelineSegment) {
  return Math.max(0.1, (segment.end ?? segment.duration ?? 0) - segment.start);
}

/** Cyclic per-item accent palette so clips, audio clips, and text overlays
 *  are each visually distinguishable from their neighbors in the same lane.
 *  Audio detached from a clip reuses that clip's color instead of getting
 *  its own — see the `audioClipColor` helper where it's assigned. */
const FADE_ACCENT_COLORS = [
  { border: "border-sky-400/60", labelBg: "bg-sky-950/80", chipBorder: "border-sky-400/50", chipBg: "bg-sky-500/15" },
  { border: "border-violet-400/60", labelBg: "bg-violet-950/80", chipBorder: "border-violet-400/50", chipBg: "bg-violet-500/15" },
  { border: "border-amber-400/60", labelBg: "bg-amber-950/80", chipBorder: "border-amber-400/50", chipBg: "bg-amber-500/15" },
  { border: "border-emerald-400/60", labelBg: "bg-emerald-950/80", chipBorder: "border-emerald-400/50", chipBg: "bg-emerald-500/15" },
  { border: "border-fuchsia-400/60", labelBg: "bg-fuchsia-950/80", chipBorder: "border-fuchsia-400/50", chipBg: "bg-fuchsia-500/15" },
  { border: "border-orange-400/60", labelBg: "bg-orange-950/80", chipBorder: "border-orange-400/50", chipBg: "bg-orange-500/15" },
  { border: "border-cyan-400/60", labelBg: "bg-cyan-950/80", chipBorder: "border-cyan-400/50", chipBg: "bg-cyan-500/15" },
  { border: "border-lime-400/60", labelBg: "bg-lime-950/80", chipBorder: "border-lime-400/50", chipBg: "bg-lime-500/15" },
] as const;
function fadeAccentColor(index: number) {
  const n = FADE_ACCENT_COLORS.length;
  return FADE_ACCENT_COLORS[((index % n) + n) % n];
}

/**
 * Overlap contributed by each seam, mirroring the clamp the renderer applies in
 * buildFadeFilterGraph (lib/ffmpeg.ts) so the playhead and the exported video
 * agree on where every clip starts.
 */
function fadeTransitionOverlaps(segments: FadeTimelineSegment[]) {
  const overlaps = segments.map(() => 0);
  if (segments.length < 2) return overlaps;
  let outputDuration = fadeSegmentDuration(segments[0]);
  outputDuration += Math.max(0, segments[0].gapBefore ?? 0);
  for (let index = 1; index < segments.length; index++) {
    const seam = segmentSeam(segments[index]);
    const duration = fadeSegmentDuration(segments[index]);
    const gap = Math.max(0, segments[index].gapBefore ?? 0);
    const overlap = seam.type === "cut" || gap > 0
      ? 0
      : Math.min(Math.max(0.1, seam.duration), Math.max(0.05, Math.min(outputDuration, duration) / 2));
    overlaps[index] = overlap;
    outputDuration += gap + duration - overlap;
  }
  return overlaps;
}

function fadeSegmentOffsets(segments: FadeTimelineSegment[]) {
  const overlaps = fadeTransitionOverlaps(segments);
  const offsets: number[] = [];
  let elapsed = 0;
  for (let index = 0; index < segments.length; index++) {
    elapsed += Math.max(0, segments[index].gapBefore ?? 0);
    if (index > 0) elapsed -= overlaps[index];
    offsets.push(elapsed);
    elapsed += fadeSegmentDuration(segments[index]);
  }
  return offsets;
}

function fadeTimelineDuration(segments: FadeTimelineSegment[]) {
  if (segments.length === 0) return 0.1;
  const offsets = fadeSegmentOffsets(segments);
  return Math.max(0.1, offsets[offsets.length - 1] + fadeSegmentDuration(segments[segments.length - 1]));
}

/** Magnetic snapping, the way every video editor's timeline does it: while
 *  dragging a clip/overlay/audio edge, if it lands within `threshold` of
 *  another item's start/end (or the playhead, or 0/duration), snap flush to
 *  it instead of the raw dragged position. Returns the raw value unchanged
 *  when nothing is close enough. */
function fadeSnap(value: number, candidates: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold;
  for (const candidate of candidates) {
    const dist = Math.abs(candidate - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/** Every time worth snapping to: clip boundaries, audio clip boundaries,
 *  text overlay boundaries, the playhead, and the timeline's own start/end —
 *  minus whichever item is currently being dragged (it shouldn't snap to
 *  itself). */
function fadeSnapTargets(params: {
  segments: FadeTimelineSegment[];
  segmentOffsets: number[];
  audioClips: FadeAudioClip[];
  captionLayers: FadeTextLayer[];
  previewTime: number;
  timelineDuration: number;
  excludeSegmentId?: string;
  excludeAudioId?: string;
  excludeCaptionId?: string;
}): number[] {
  const times = [0, params.timelineDuration, params.previewTime];
  params.segments.forEach((segment, index) => {
    if (segment.id === params.excludeSegmentId) return;
    const start = params.segmentOffsets[index];
    times.push(start, start + fadeSegmentDuration(segment));
  });
  params.audioClips.forEach((clip) => {
    if (clip.id === params.excludeAudioId) return;
    times.push(clip.start, clip.end);
  });
  params.captionLayers.forEach((layer) => {
    if (layer.id === params.excludeCaptionId) return;
    times.push(layer.start, layer.end);
  });
  return times;
}

function locateFadeTimelinePosition(segments: FadeTimelineSegment[], position: number) {
  const offsets = fadeSegmentOffsets(segments);
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const offset = offsets[index];
    const duration = fadeSegmentDuration(segment);
    if (position >= offset && position < offset + duration) {
      return {
        segment,
        index,
        offset,
        sourceTime: segment.start + Math.min(duration, Math.max(0, position - offset)),
      };
    }
  }
  return null;
}

function formatFadeTime(seconds: number, tenths = false) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remaining = safe - minutes * 60;
  return `${minutes}:${tenths ? remaining.toFixed(1).padStart(4, "0") : Math.floor(remaining).toString().padStart(2, "0")}`;
}

function fadeTimelineTicks(duration: number) {
  const interval = duration <= 30 ? 5 : duration <= 120 ? 10 : duration <= 300 ? 30 : 60;
  const ticks = Array.from({ length: Math.floor(duration / interval) + 1 }, (_, index) => index * interval);
  if (ticks[ticks.length - 1] !== duration) ticks.push(duration);
  return ticks;
}

/** Greedy interval packing: items that overlap in time land on separate rows
 *  (like every other timeline editor's caption/audio lane), so two
 *  overlapping items never cover each other and both stay grabbable. Honors
 *  each item's own `row` as a preference — used when the user has dragged an
 *  item to a specific row, or reserved an empty one via "Add Row" — falling
 *  back to the first free row when that preference would overlap. Shared by
 *  the Captions lane and every audio lane (Original/Detached/Soundtrack). */
function fadeRowPack<T extends { start: number; end: number; row?: number }>(items: T[]): T[][] {
  const rows: T[][] = [];
  const overlaps = (row: T[], item: T) =>
    row.some((other) => item.start < other.end && item.end > other.start);
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    const preferredRow = Number.isInteger(item.row) ? Math.max(0, item.row ?? 0) : null;
    let rowIndex =
      preferredRow !== null && !overlaps(rows[preferredRow] ?? [], item)
        ? preferredRow
        : rows.findIndex((row) => !overlaps(row, item));
    if (rowIndex < 0) rowIndex = rows.length;
    while (rows.length <= rowIndex) rows.push([]);
    rows[rowIndex].push(item);
  }
  return rows;
}
function fadeCaptionRows(layers: FadeTextLayer[]): FadeTextLayer[][] {
  return fadeRowPack(layers);
}

const FADE_AUDIO_ROW_HEIGHT = 40;
const FADE_CAPTION_ROW_HEIGHT = 40;

function fadeAudioRows(clips: FadeAudioClip[]): FadeAudioClip[][] {
  return fadeRowPack(clips);
}

function fadeFirstAvailableAudioRow(
  clips: FadeAudioClip[],
  start: number,
  end: number,
) {
  const rows = fadeAudioRows(clips);
  const rowIndex = rows.findIndex((row) =>
    row.every((clip) => end <= clip.start || start >= clip.end),
  );
  return rowIndex >= 0 ? rowIndex : rows.length;
}
/** Where a pasted audio/caption item should land: stay on `preferred` (the
 *  copied item's own row) if the paste's time range fits there, otherwise
 *  the first free row *below* it — never above, so "paste over yourself"
 *  reliably reads as "new row directly under the original." */
function fadeFirstAvailableRowFrom<T extends { start: number; end: number }>(
  rows: T[][],
  start: number,
  end: number,
  preferred: number,
): number {
  const overlaps = (row: T[] | undefined) => (row ?? []).some((item) => start < item.end && end > item.start);
  if (!overlaps(rows[preferred])) return preferred;
  for (let index = preferred + 1; index < rows.length; index++) {
    if (!overlaps(rows[index])) return index;
  }
  return rows.length;
}

const FADE_FALLBACK_WAVEFORM = Array.from({ length: 160 }, (_, index) => {
  const envelope = 0.18 + 0.82 * Math.pow(Math.sin((index / 159) * Math.PI), 0.65);
  const detail = 0.12 + ((index * 37 + index * index * 11) % 88) / 100;
  return Math.min(1, envelope * detail);
});

function useFadeWaveforms(mediaIds: string[]) {
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  // Populated from the same decodeAudioData pass as the peaks — the soundtrack's
  // default trim window needs to know its own file's length, and this is
  // already downloading+decoding the file anyway, so no separate probe.
  const [durations, setDurations] = useState<Record<string, number>>({});
  // Tracked in a ref, not read off `waveforms`: keeping state in the dep array
  // re-ran this on every resolved waveform and re-downloaded whole video files.
  const requested = useRef(new Set<string>());
  const mediaKey = [...new Set(mediaIds)].sort().join("|");

  useEffect(() => {
    const ids = mediaKey ? mediaKey.split("|") : [];
    const missing = ids.filter((id) => !requested.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(id));
    let cancelled = false;
    const context = new AudioContext();
    void (async () => {
      for (const id of missing) {
        try {
          const response = await fetch(`/api/media-file/${id}`);
          if (!response.ok) throw new Error("Waveform media unavailable.");
          const audioBuffer = await context.decodeAudioData(await response.arrayBuffer());
          if (!cancelled) setDurations((current) => ({ ...current, [id]: audioBuffer.duration }));
          const bucketCount = 240;
          const bucketSize = Math.max(1, Math.floor(audioBuffer.length / bucketCount));
          const peaks = Array.from({ length: bucketCount }, (_, bucket) => {
            let peak = 0;
            const start = bucket * bucketSize;
            const end = Math.min(audioBuffer.length, start + bucketSize);
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
              const samples = audioBuffer.getChannelData(channel);
              for (let sample = start; sample < end; sample += Math.max(1, Math.floor(bucketSize / 48))) {
                peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
              }
            }
            return peak;
          });
          const ceiling = Math.max(0.01, ...peaks);
          if (!cancelled) setWaveforms((current) => ({ ...current, [id]: peaks.map((peak) => Math.min(1, peak / ceiling)) }));
        } catch {
          if (!cancelled) setWaveforms((current) => ({ ...current, [id]: FADE_FALLBACK_WAVEFORM }));
        }
      }
      await context.close().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      void context.close().catch(() => undefined);
    };
  }, [mediaKey]);

  return { waveforms, durations };
}

function FadeWaveform({ peaks, startRatio = 0, endRatio = 1, className = "", fill = "currentColor" }: { peaks?: number[]; startRatio?: number; endRatio?: number; className?: string; fill?: string }) {
  const source = peaks?.length ? peaks : FADE_FALLBACK_WAVEFORM;
  const start = Math.max(0, Math.min(source.length - 1, Math.floor(source.length * startRatio)));
  const end = Math.max(start + 2, Math.min(source.length, Math.ceil(source.length * endRatio)));
  const visible = source.slice(start, end);
  const top = visible.map((peak, index) => `${(index / Math.max(1, visible.length - 1)) * 100},${50 - Math.max(0.035, peak) * 44}`).join(" L");
  const bottom = [...visible].reverse().map((peak, reverseIndex) => {
    const index = visible.length - 1 - reverseIndex;
    return `${(index / Math.max(1, visible.length - 1)) * 100},${50 + Math.max(0.035, peak) * 44}`;
  }).join(" L");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className={className}><path d={`M${top} L${bottom} Z`} fill={fill} /></svg>;
}

const FADE_WORKFLOW_STEPS = ["Build", "Captions", "Review & Summary"] as const;

/** Custom drag types, so the timeline can tell our two drag gestures apart. */
const TRANSITION_DND_TYPE = "application/x-transition";
const CLIP_DND_TYPE = "application/x-clip-index";

/** Square tiles: matches the video track's inner height (h-[74px] less inset-y-1). */
const FILMSTRIP_TILE_PX = 66;

// The timeline canvas is sized in real pixels-per-second, not as a percentage
// of its container. A percentage width can't shrink from trimming (block
// width and container width shrink together, so a single clip is always
// ~100%) and can't zoom out past "fills the container" — both of which are
// the point of a zoom control. Below 1x the content is simply narrower than
// the (already black-backed) viewport, same as any other timeline editor.
const TIMELINE_PIXELS_PER_SECOND = 24;
const TIMELINE_ZOOM_MIN = 0.25;
const TIMELINE_ZOOM_MAX = 4;
const TIMELINE_ZOOM_STEP = 0.25;
const TIMELINE_MIN_WIDTH_PX = 240;
// Width of the sticky row-type gutter (w-7) — sticky-left content inside the
// canvas has to clear it, or it renders hidden behind the gutter once scrolled.
const FADE_TIMELINE_GUTTER_WIDTH = 28;
const clampTimelineZoom = (value: number) => Math.min(TIMELINE_ZOOM_MAX, Math.max(TIMELINE_ZOOM_MIN, value));
const filmstripCache = new Map<string, number>();
const filmstripUrl = (mediaId: string) => `/api/app/media/${mediaId}/filmstrip`;

/**
 * How many frames each clip's filmstrip holds, or 0 for "no strip". The strip
 * is one same-origin JPEG of square frames from
 * GET /api/app/media/{id}/filmstrip; since the tiles are square, the frame
 * count falls out of the image's own aspect ratio and never has to be agreed
 * separately with the server.
 *
 * Grabbing frames in the browser instead doesn't work here: media is served as
 * a 302 to a presigned R2 URL, so a <video> pointed at it either fails to load
 * (with crossOrigin set — presigned URLs send no CORS headers) or taints the
 * canvas so toDataURL throws (without it).
 */
function useFadeFilmstrips(mediaIds: string[]) {
  const [strips, setStrips] = useState<Record<string, number>>(() => Object.fromEntries(filmstripCache));
  const requested = useRef(new Set<string>());
  const mediaKey = [...new Set(mediaIds)].sort().join("|");

  useEffect(() => {
    const missing = (mediaKey ? mediaKey.split("|") : []).filter((id) => !filmstripCache.has(id) && !requested.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(id));
    let cancelled = false;
    void (async () => {
      for (const id of missing) {
        // The browser caches the image itself; this resolves the frame count
        // and confirms one exists, so a clip never shows a broken background.
        const frames = await new Promise<number>((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve(probe.naturalHeight > 0 ? Math.max(1, Math.round(probe.naturalWidth / probe.naturalHeight)) : 0);
          probe.onerror = () => resolve(0);
          probe.src = filmstripUrl(id);
        });
        if (cancelled) return;
        filmstripCache.set(id, frames);
        setStrips((current) => ({ ...current, [id]: frames }));
      }
    })();
    return () => { cancelled = true; };
  }, [mediaKey]);

  return strips;
}

/**
 * Background styles that show sprite frame `index` of `frames` in a
 * tile-sized box. Percentage background-position maps p to an offset of
 * p x (frames - 1) tiles, so p = index / (frames - 1) lands on frame `index`.
 */
function filmstripTileStyle(mediaId: string, index: number, frames: number): React.CSSProperties {
  return {
    backgroundImage: `url(${filmstripUrl(mediaId)})`,
    backgroundSize: `${frames * 100}% 100%`,
    backgroundPositionX: frames > 1 ? `${(index / (frames - 1)) * 100}%` : "0%",
  };
}

// Picsum (picsum.photos) serves free-to-use stock photos with no API key —
// seeding by string gives a stable, different photo per seed. Used only for
// the transition library's decorative previews, so if it's unreachable the
// onError handler below swaps in the bundled local placeholder instead.
function fadeTransitionPhotoUrl(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/200/100`;
}
function fadeTransitionPhotoFallback(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = "/stock-photo.webp";
}

/** Two swatches animating through a transition — the library tile's preview. */
function TransitionSwatch({ id, progress }: { id: TransitionId; progress: number }) {
  const preview = transitionPreviewStyles(id, progress);
  const outgoingZ = preview.swapLayers ? 2 : 1;
  return <span aria-hidden="true" className="relative block h-11 w-full overflow-hidden rounded bg-neutral-900">
    {preview.backdrop && <span className="absolute inset-0" style={{ background: preview.backdrop }} />}
    <span className="absolute inset-0 overflow-hidden" style={{ ...preview.outgoing, zIndex: outgoingZ }}><img src={fadeTransitionPhotoUrl(`${id}-a`)} onError={fadeTransitionPhotoFallback} alt="" loading="lazy" className="h-full w-full object-cover" /></span>
    <span className="absolute inset-0 overflow-hidden" style={{ ...preview.incoming, zIndex: 3 - outgoingZ }}><img src={fadeTransitionPhotoUrl(`${id}-b`)} onError={fadeTransitionPhotoFallback} alt="" loading="lazy" className="h-full w-full object-cover" /></span>
  </span>;
}

function TransitionTile({ id, label, approx, selected, onApply }: { id: TransitionId; label: string; approx?: boolean; selected: boolean; onApply: (id: TransitionId) => void }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  const stop = () => { window.cancelAnimationFrame(frame.current); setProgress(0); };
  const start = () => {
    const startedAt = performance.now();
    const step = () => {
      setProgress(((performance.now() - startedAt) / 1100) % 1);
      frame.current = window.requestAnimationFrame(step);
    };
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(step);
  };
  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);
  return <button
    type="button"
    draggable
    onDragStart={(event) => { event.dataTransfer.setData(TRANSITION_DND_TYPE, id); event.dataTransfer.effectAllowed = "copy"; }}
    onDragEnd={stop}
    onMouseEnter={start}
    onMouseLeave={stop}
    onFocus={start}
    onBlur={stop}
    onClick={() => onApply(id)}
    title={approx ? `${label} — the preview is an approximation of the rendered effect` : `${label} — drag onto a seam, or click to apply`}
    className={`group flex cursor-grab flex-col gap-1.5 rounded-lg border p-1.5 text-left active:cursor-grabbing ${selected ? "border-primary bg-primary/15" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`}
  >
    <TransitionSwatch id={id} progress={progress} />
    <span className="flex items-center gap-1 truncate px-0.5 text-[10px] font-semibold text-neutral-300">{label}{approx && <span className="text-neutral-500" title="Preview is approximate">≈</span>}</span>
  </button>;
}

function FadeTransitionLibrary({ selectedId, onApply }: { selectedId: TransitionId | null; onApply: (id: TransitionId) => void }) {
  const [group, setGroup] = useState<TransitionGroup>(() => transitionById(selectedId ?? "")?.group ?? TRANSITION_GROUPS[0]);
  const items = TRANSITIONS.filter((entry) => entry.group === group);
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
      {TRANSITION_GROUPS.map((entry) => (
        <button
          key={entry}
          type="button"
          onClick={() => setGroup(entry)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${group === entry ? "bg-primary/20 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"}`}
        >
          {entry}
        </button>
      ))}
    </div>
    <div className="grid max-h-80 grid-cols-3 content-start gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((entry) => <TransitionTile key={entry.id} id={entry.id} label={entry.label} approx={entry.approx} selected={selectedId === entry.id} onApply={onApply} />)}
    </div>
  </div>;
}

const FADE_HOTKEYS: { label: string; win: string; mac: string }[] = [
  { label: "Undo", win: "Ctrl+Z", mac: "⌘Z" },
  { label: "Redo", win: "Ctrl+Y", mac: "⌘⇧Z" },
  { label: "Play / Pause", win: "Space", mac: "Space" },
  { label: "Delete selected", win: "Delete / Backspace", mac: "Delete / Backspace" },
  { label: "Move audio clip row", win: "Alt+↑ / Alt+↓", mac: "⌥↑ / ⌥↓" },
];

/** Hover/focus tooltip listing the editor's keyboard shortcuts, Windows and
 *  Mac variants side by side — CSS-only (group-hover/group-focus-within), no
 *  open state to manage. */
function FadeHotkeysTooltip() {
  return <div className="group relative flex">
    <button
      type="button"
      aria-label="Keyboard shortcuts"
      className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Icon name="info" size={14} />
    </button>
    <div
      role="tooltip"
      className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-72 origin-top-left scale-95 rounded-xl border border-white/10 bg-[#161616] p-3 opacity-0 shadow-xl transition-[opacity,transform] duration-100 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">Keyboard shortcuts</p>
      <dl className="space-y-1.5">
        {FADE_HOTKEYS.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <dt className="text-xs text-neutral-300">{item.label}</dt>
            <dd className="flex items-center gap-1">
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">{item.win}</kbd>
              {item.win !== item.mac && <>
                <span className="text-[10px] text-neutral-600">/</span>
                <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">{item.mac}</kbd>
              </>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  </div>;
}

function FadeCropModal({ segment, targetAspect, initial, progressLabel, actionLabel, onSave, onClose }: { segment: FadeTimelineSegment; targetAspect: VideoAspect; initial: { x: number; y: number }; progressLabel?: string; actionLabel: string; onSave: (crop: { x: number; y: number }) => void; onClose: () => void }) {
  const [crop, setCrop] = useState(initial);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ clientX: number; clientY: number; position: number } | null>(null);
  const targetRatio = targetAspect.width / targetAspect.height;
  const videoRatio = videoSize ? videoSize.width / videoSize.height : targetRatio;
  const horizontalCrop = videoRatio > targetRatio + 0.005;
  const verticalCrop = videoRatio < targetRatio - 0.005;
  const cropWidthPercent = horizontalCrop ? (targetRatio / videoRatio) * 100 : 100;
  const cropHeightPercent = verticalCrop ? (videoRatio / targetRatio) * 100 : 100;
  const cropLeftPercent = horizontalCrop ? (100 - cropWidthPercent) * crop.x : 0;
  const cropTopPercent = verticalCrop ? (100 - cropHeightPercent) * crop.y : 0;
  const frameWidth = Math.min(560, videoRatio > 0 ? 460 * videoRatio : 560);
  const frameHeight = Math.min(460, frameWidth / videoRatio);
  const canDrag = horizontalCrop || verticalCrop;

  function moveCrop(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !containerRef.current || !canDrag) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (horizontalCrop) {
      const travel = rect.width * (1 - cropWidthPercent / 100);
      if (travel > 0) setCrop((current) => ({ ...current, x: Math.min(1, Math.max(0, dragStart.current!.position + (event.clientX - dragStart.current!.clientX) / travel)) }));
    } else {
      const travel = rect.height * (1 - cropHeightPercent / 100);
      if (travel > 0) setCrop((current) => ({ ...current, y: Math.min(1, Math.max(0, dragStart.current!.position + (event.clientY - dragStart.current!.clientY) / travel)) }));
    }
  }

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="fade-crop-title" onClick={onClose}><div className="card w-full max-w-3xl p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h3 id="fade-crop-title" className="text-lg font-bold">Reposition crop</h3><p className="mt-1 text-sm text-muted">{progressLabel ? `${progressLabel} · ` : ""}{canDrag ? "Drag the highlighted crop window to choose what stays visible." : "This video already matches the selected aspect ratio."}</p></div><button type="button" onClick={onClose} aria-label="Close crop dialog" className="btn-subtle !px-3"><Icon name="x" size={16} /></button></div><div className="mt-5 flex justify-center"><div ref={containerRef} className="relative touch-none select-none overflow-hidden rounded-xl bg-ink" style={{ width: frameWidth, height: frameHeight }}><video src={`/api/media-file/${segment.media.id}`} className="pointer-events-none absolute inset-0 h-full w-full" onLoadedMetadata={(event) => setVideoSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} muted autoPlay loop playsInline />{canDrag && <div className="absolute border-2 border-white" style={{ left: `${cropLeftPercent}%`, top: `${cropTopPercent}%`, width: `${cropWidthPercent}%`, height: `${cropHeightPercent}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)", cursor: horizontalCrop ? "ew-resize" : "ns-resize" }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = { clientX: event.clientX, clientY: event.clientY, position: horizontalCrop ? crop.x : crop.y }; }} onPointerMove={moveCrop} onPointerUp={(event) => { dragStart.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} />}</div></div><p className="mt-3 text-center text-xs font-semibold text-muted">{targetAspect.name} · {targetAspect.px} · Position {Math.round(crop.x * 100)}% horizontal, {Math.round(crop.y * 100)}% vertical</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCrop({ x: 0.5, y: 0.5 })} className="btn-subtle"><Icon name="refresh" size={14} /> Center</button><button type="button" onClick={onClose} className="btn-subtle">Cancel</button><button type="button" onClick={() => onSave(crop)} className="btn-primary"><Icon name={actionLabel === "Save" ? "check" : "chevronRight"} size={15} /> {actionLabel}</button></div></div></div>;
}

function FadeUploadScopeDialog({ platformId, platformCount, onCurrent, onAll, onCancel }: { platformId: string; platformCount: number; onCurrent: () => void; onAll: () => void; onCancel: () => void }) {
  const platformName = platformId === "default" ? "current format" : platformOf(platformId)?.name ?? platformId;
  return <div className="fixed inset-0 z-[115] flex items-center justify-center bg-ink/55 p-4" role="dialog" aria-modal="true" aria-labelledby="fade-upload-scope-title"><div className="card w-full max-w-md p-5 shadow-2xl"><h3 id="fade-upload-scope-title" className="text-lg font-bold">Where should this video apply?</h3><p className="mt-1.5 text-sm text-muted">Choose one platform or crop this video consecutively for every selected aspect ratio.</p><div className="mt-5 flex flex-col gap-2"><button type="button" onClick={onCurrent} className="btn-primary justify-start">Only {platformName}</button><button type="button" onClick={onAll} className="btn-subtle justify-start" disabled={platformCount < 2}>All selected platforms{platformCount > 1 ? ` (${platformCount})` : ""}</button><button type="button" onClick={onCancel} className="btn-subtle justify-start">Cancel</button></div></div></div>;
}

/** A tab per rendered platform, showing that platform's own output — reused
 *  on Captions, Review & Summary, and inside the Build-step preview modal. */
function FadePlatformPreview({ platformOutputMediaIds, activePlatform, onSelectPlatform }: { platformOutputMediaIds: Record<string, string>; activePlatform: string | null; onSelectPlatform: (platformId: string) => void }) {
  const platformIds = Object.keys(platformOutputMediaIds);
  const active = (activePlatform && platformOutputMediaIds[activePlatform]) ? activePlatform : platformIds[0];
  const mediaId = active ? platformOutputMediaIds[active] : null;
  if (!mediaId) return null;
  return <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
    {platformIds.length > 1 && <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-neutral-950 p-2.5">{platformIds.map((platformId) => <button key={platformId} type="button" data-edit-guard-exempt onClick={() => onSelectPlatform(platformId)} className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${active === platformId ? "border-primary bg-primary/20 text-white" : "border-white/15 bg-white/5 text-neutral-300 hover:border-primary/60 hover:bg-white/10 hover:text-white"}`}><PlatformIcon id={platformId} size={13} darkSurface />{platformOf(platformId)?.name ?? platformId}</button>)}</div>}
    <video key={mediaId} src={`/api/media-file/${mediaId}`} className="mx-auto max-h-[58vh] w-full object-contain" controls playsInline />
  </div>;
}

/** Full-screen preview of a rendered platform, opened from the "Preview" button. */
function FadePreviewModal({ platformOutputMediaIds, activePlatform, onSelectPlatform, onClose }: { platformOutputMediaIds: Record<string, string>; activePlatform: string | null; onSelectPlatform: (platformId: string) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-labelledby="fade-preview-title" onClick={onClose}>
    <div className="card w-full max-w-lg p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3"><h3 id="fade-preview-title" className="text-lg font-bold">Preview</h3><button type="button" onClick={onClose} aria-label="Close preview" className="btn-subtle !px-3"><Icon name="x" size={16} /></button></div>
      <div className="mt-4"><FadePlatformPreview platformOutputMediaIds={platformOutputMediaIds} activePlatform={activePlatform} onSelectPlatform={onSelectPlatform} /></div>
    </div>
  </div>;
}

/** Choose which selected destinations to render (or "Select all"). */
function FadeRenderScopeDialog({ platforms, defaultChecked, onClose, onRender }: { platforms: string[]; defaultChecked: string[]; onClose: () => void; onRender: (targets: string[]) => void }) {
  const [checked, setChecked] = useState(() => new Set(defaultChecked.length > 0 ? defaultChecked : platforms));
  const allChecked = platforms.length > 0 && platforms.every((platformId) => checked.has(platformId));
  // defaultChecked only ever pre-checks platforms that still need a render
  // (see the call site) — anything left out already has a current render, so
  // that's a stable enough signal to badge it, even after the user toggles
  // checkboxes around it.
  const alreadyRendered = new Set(platforms.filter((platformId) => !defaultChecked.includes(platformId)));
  const redundant = [...checked].filter((platformId) => alreadyRendered.has(platformId));
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="fade-render-scope-title" onClick={onClose}>
    <div className="card w-full max-w-md p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <h3 id="fade-render-scope-title" className="text-lg font-bold">Render for which destinations?</h3>
      <p className="mt-1.5 text-sm text-muted">Each platform renders separately, using its own crop and aspect ratio.</p>
      <label className="mt-4 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold">
        <input type="checkbox" checked={allChecked} onChange={(event) => setChecked(event.target.checked ? new Set(platforms) : new Set())} />
        Select all{platforms.length > 0 ? ` (${platforms.length})` : ""}
      </label>
      <div className="mt-2 flex flex-col gap-1.5">
        {platforms.map((platformId) => <label key={platformId} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-page/60">
          <input type="checkbox" checked={checked.has(platformId)} onChange={(event) => setChecked((current) => { const next = new Set(current); event.target.checked ? next.add(platformId) : next.delete(platformId); return next; })} />
          <PlatformIcon id={platformId} size={14} />{platformOf(platformId)?.name ?? platformId}
          {alreadyRendered.has(platformId) && (
            <span className="ml-auto flex items-center gap-1 text-xs font-bold text-emerald-700">
              <Icon name="check" size={12} /> Already rendered
            </span>
          )}
        </label>)}
      </div>
      {redundant.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Icon name="warningTriangle" size={14} className="mt-0.5 shrink-0" />
          {redundant.length === 1
            ? `${platformOf(redundant[0])?.name ?? redundant[0]} already has a current render — this will re-render it again.`
            : `${redundant.map((id) => platformOf(id)?.name ?? id).join(", ")} already have current renders — this will re-render them again.`}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-subtle">Cancel</button>
        <button type="button" onClick={() => onRender([...checked])} disabled={checked.size === 0} className="btn-primary disabled:opacity-50"><Icon name="sparkles" size={15} /> Render {checked.size > 0 ? `${checked.size} platform${checked.size === 1 ? "" : "s"}` : ""}</button>
      </div>
    </div>
  </div>;
}

type FadeAttachedAudioAction = "detach" | "delete" | "split";

/** Shown before an edit separates a source clip's embedded audio from video. */
function FadeDetachAudioDialog({
  action,
  onClose,
  onConfirm,
}: {
  action: FadeAttachedAudioAction;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy =
    action === "delete"
      ? {
          title: "Remove this clip's audio?",
          body: "The video stays in place, but its original audio will be muted. You can undo this.",
          action: "Remove audio",
        }
      : action === "split"
        ? {
            title: "Detach and split this audio?",
            body: "Splitting creates two independent audio clips at the playhead. The video stays in place and its original audio is muted. You can undo this.",
            action: "Detach & split",
          }
        : {
            title: "Detach this clip's audio?",
            body: "Trimming or moving this audio separates it from the video into an independent audio clip. The video keeps playing, with its original audio muted. You can undo this.",
            action: "Detach audio",
          };
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="fade-detach-audio-title" onClick={onClose}>
    <div className="card w-full max-w-md p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <h3 id="fade-detach-audio-title" className="text-lg font-bold">{copy.title}</h3>
      <p className="mt-1.5 text-sm text-muted">{copy.body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-subtle">Cancel</button>
        <button type="button" onClick={onConfirm} className="btn-primary">{copy.action}</button>
      </div>
    </div>
  </div>;
}

/** One draggable/resizable/inline-editable caption box on the live preview —
 *  interaction model duplicated from slideshow-studio.tsx's LayerView (drag to
 *  move, drag the dot to resize, double-click to edit text, × to delete). */
function FadeCaptionLayerView({ layer, selected, frameRef, onSelect, onChange, onDelete }: { layer: FadeTextLayer; selected: boolean; frameRef: RefObject<HTMLDivElement | null>; onSelect: () => void; onChange: (patch: Partial<FadeTextLayer>) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const resizing = useRef(false);

  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.textContent = layer.text;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const st = fadeLayerStyle(layer);
  const font = fadeLayerFont(layer);
  const hasText = layer.text.trim().length > 0;

  function onMoveDown(event: React.PointerEvent) {
    if (editing) return;
    event.stopPropagation();
    onSelect();
    const frame = frameRef.current;
    if (!frame) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const r = frame.getBoundingClientRect();
    const cx = r.left + (layer.x / 100) * r.width;
    const cy = r.top + (layer.y / 100) * r.height;
    grab.current = { dx: event.clientX - cx, dy: event.clientY - cy };
  }
  function onMoveMove(event: React.PointerEvent) {
    if (!grab.current) return;
    const frame = frameRef.current;
    const box = boxRef.current;
    if (!frame || !box) return;
    const r = frame.getBoundingClientRect();
    const el = box.getBoundingClientRect();
    const halfW = (el.width / 2 / r.width) * 100;
    const halfH = (el.height / 2 / r.height) * 100;
    const x = ((event.clientX - grab.current.dx - r.left) / r.width) * 100;
    const y = ((event.clientY - grab.current.dy - r.top) / r.height) * 100;
    onChange({
      x: halfW >= 50 ? 50 : clamp(x, halfW, 100 - halfW),
      y: halfH >= 50 ? 50 : clamp(y, halfH, 100 - halfH),
    });
  }
  function onMoveUp(event: React.PointerEvent) {
    grab.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  }
  function onResizeDown(event: React.PointerEvent) {
    event.stopPropagation();
    event.preventDefault();
    onSelect();
    resizing.current = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onResizeMove(event: React.PointerEvent) {
    if (!resizing.current) return;
    const frame = frameRef.current;
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const cx = r.left + (layer.x / 100) * r.width;
    const halfPx = Math.abs(event.clientX - cx);
    onChange({ width: clamp(((halfPx * 2) / r.width) * 100, 15, 96) });
  }
  function onResizeUp(event: React.PointerEvent) {
    resizing.current = false;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  return (
    <div
      ref={boxRef}
      data-keep-selection
      style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, transform: "translate(-50%, -50%)" }}
      className={`absolute z-20 touch-none px-1 text-center ${selected ? "rounded outline outline-2 outline-primary outline-offset-2" : ""}`}
      onPointerDown={onMoveDown}
      onPointerMove={onMoveMove}
      onPointerUp={onMoveUp}
      onPointerCancel={onMoveUp}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onSelect();
        setEditing(true);
      }}
    >
      <div
        ref={editRef}
        contentEditable={editing}
        suppressContentEditableWarning
        onInput={(event) => onChange({ text: event.currentTarget.innerText.slice(0, 200) })}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") (event.target as HTMLElement).blur();
        }}
        style={{
          fontSize: `${layer.scale}cqw`,
          fontFamily: font.stack,
          color: layer.color || st.fill,
          ...(layer.bgEnabled ? { backgroundColor: fadeHexToRgba(layer.bgColor, layer.bgOpacity ?? 100) } : {}),
        }}
        className={`inline-block whitespace-pre-wrap break-words rounded px-[0.3em] py-[0.12em] font-black leading-tight outline-none ${st.className} ${hasText || editing ? "" : "italic"} ${editing ? "cursor-text" : "cursor-grab select-none active:cursor-grabbing"}`}
      >
        {editing ? undefined : hasText ? layer.text : "Double click to edit text"}
      </div>
      {selected && !editing && (
        <>
          <span
            aria-label="Drag to resize width"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 cursor-ew-resize touch-none rounded-full border-2 border-primary bg-white shadow"
          />
          <button
            type="button"
            aria-label="Delete caption"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onDelete(); }}
            className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow"
          >
            <Icon name="x" size={11} />
          </button>
        </>
      )}
    </div>
  );
}

function FadeStudioWorkflow({
  accounts, selectedAccountIds, setSelectedAccountIds, activePlatform, setActivePlatform, platformFormatIds, setPlatformFormatIds, segments, activeSegment, setActiveSegmentId, splitAt, setSplitAt, splitActive, beginEditorEdit, setActiveTrim, duplicateActive, removeActive, setActiveVolume, muteSegmentAudio, pasteSegment, undo, redo, canUndo, canRedo,
  transition, setTransition, transitionDuration, setTransitionDuration, closingSeam, setSegmentSeam, setSegmentGap, moveSegment,
  audioClips, setAudioClips, selectedAudioClipId, setSelectedAudioClipId, audioUploading, onAudioUpload, onAudioLibrary,
  caption, setCaption, uploading, uploadStage, onUpload, onLibrary, onCrop, fileInput, onFile, error, setError, rendering, outputMediaId, initialDraft, initialDraftId, initialDraftStatus,
  platformOutputMediaIds, platformRenderStatuses, renderSignatures, rendersAreCurrent, dirtyRenderPlatforms, renderElapsedSeconds, renderStatusLabel, startRender,
  renderScopeOpen, setRenderScopeOpen, previewOpen, setPreviewOpen,
  captionLayers, setCaptionLayers, selectedCaptionId, setSelectedCaptionId,
}: {
  accounts: FadeInAccount[]; selectedAccountIds: Set<number>; setSelectedAccountIds: (value: Set<number> | ((current: Set<number>) => Set<number>)) => void; activePlatform: string; setActivePlatform: (value: string) => void; platformFormatIds: Record<string, string>; setPlatformFormatIds: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void; segments: FadeTimelineSegment[]; activeSegment: FadeTimelineSegment | null;
  setActiveSegmentId: (id: string) => void; splitAt: number; setSplitAt: (value: number) => void; splitActive: () => void; beginEditorEdit: () => void; setActiveTrim: (start: number, end: number) => void; duplicateActive: () => void; removeActive: () => void; setActiveVolume: (value: number) => void; muteSegmentAudio: (segmentId: string) => void; pasteSegment: (segment: FadeTimelineSegment, afterSegmentId: string | null) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  transition: FadeTransition; setTransition: (value: FadeTransition) => void; transitionDuration: number; setTransitionDuration: (value: number) => void; closingSeam: FadeSeam;
  setSegmentSeam: (index: number, seam: FadeSeam) => void; setSegmentGap: (id: string, gapBefore: number) => void; moveSegment: (from: number, to: number) => void;
  audioClips: FadeAudioClip[]; setAudioClips: (value: FadeAudioClip[] | ((current: FadeAudioClip[]) => FadeAudioClip[])) => void; selectedAudioClipId: string | null; setSelectedAudioClipId: (id: string | null) => void; audioUploading: boolean; onAudioUpload: () => void; onAudioLibrary: () => void;
  caption: string; setCaption: (value: string) => void; uploading: boolean; uploadStage: string; onUpload: () => void; onLibrary: () => void; onCrop: () => void; fileInput: RefObject<HTMLInputElement | null>; onFile: (file: File) => void;
  error: string; setError?: (value: string) => void; rendering: boolean; outputMediaId: string | null; initialDraft?: FadeDraftSnapshot; initialDraftId?: string; initialDraftStatus?: string;
  captionLayers: FadeTextLayer[]; setCaptionLayers: (value: FadeTextLayer[] | ((current: FadeTextLayer[]) => FadeTextLayer[])) => void; selectedCaptionId: string | null; setSelectedCaptionId: (id: string | null) => void;
  platformOutputMediaIds: Record<string, string>; platformRenderStatuses: Record<string, FadeJobStatus>; renderSignatures: Record<string, string>; rendersAreCurrent: boolean; dirtyRenderPlatforms: string[]; renderElapsedSeconds: number; renderStatusLabel: (status: FadeJobStatus | undefined) => string; startRender: (targets: string[]) => void;
  renderScopeOpen: boolean; setRenderScopeOpen: (value: boolean) => void; previewOpen: boolean; setPreviewOpen: (value: boolean) => void;
}) {
  const [step, setStep] = useState(() => Math.max(0, Math.min(2, initialDraft?.step ?? 0)));
  const [previewPlatform, setPreviewPlatform] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  // Seeded true when opened from the choose screen's "Finished" section, so
  // the button reads "Finished" immediately rather than needing a fresh
  // Finish click just because the page reloaded.
  const [finishedMediaId, setFinishedMediaId] = useState<string | null>(() => (initialDraftStatus === "finished" ? outputMediaId : null));
  // Nothing is visually locked — useEditGuard below intercepts the first real
  // edit while this is true and prompts before flipping it back off.
  const [draftLocked, setDraftLocked] = useState(() => initialDraftStatus === "finished");
  async function finish(): Promise<boolean> {
    if (!outputMediaId || finishing) return false;
    const renderedOutputs = Object.entries(platformOutputMediaIds)
      .filter(([platformId, mediaId]) => selectedPlatforms.includes(platformId) && !!mediaId)
      .map(([platformId, mediaId]) => ({
        media_id: mediaId,
        platform_id: platformId,
        aspect_ratio: fadeFormatFor(platformId, platformFormatIds).aspect.name,
      }));
    const mediaIds = [...new Set(renderedOutputs.map((output) => output.media_id).concat(outputMediaId))];
    // The per-platform captions are the preferred post copy. When a creator
    // only wrote the Studio's main caption, carry that into every selected
    // destination so Create Post never opens with empty overrides.
    const captionsForPublish = Object.fromEntries(
      selectedPlatforms.flatMap((platformId) => {
        const text = platformCaptions[platformId]?.trim() || caption.trim();
        return text ? [[platformId, text]] : [];
      })
    );
    setFinishing(true);
    try {
      const res = await fetch("/api/app/studio/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_ids: mediaIds,
          template: "fade-in",
          campaign_name: campaignName,
          platform_ids: selectedPlatforms,
          platform_captions: captionsForPublish,
          caption_brief: caption,
          caption_length: captionLength,
          output_metadata: renderedOutputs,
        }),
      });
      if (res.ok) {
        setFinishedMediaId(outputMediaId);
        if (draftId.current) {
          await fetch(`/api/app/studio/drafts/${draftId.current}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "finished" }),
          }).catch(() => {});
        }
        return true;
      }
      setError?.("Couldn’t save the rendered videos to your Library. Please try again.");
      return false;
    } catch {
      setError?.("Couldn’t save the rendered videos to your Library. Check your connection and try again.");
      return false;
    } finally {
      setFinishing(false);
    }
  }
  async function publish() {
    // Re-save here as well: it backfills destination metadata for a draft
    // finished before this hand-off existed, then opens Create Post only when
    // every rendered variant can be identified safely.
    if (!(await finish())) return;
    const mediaIds = [...new Set(Object.values(platformOutputMediaIds).concat(outputMediaId ?? "").filter(Boolean))];
    window.location.assign(`/dashboard/create/video?${new URLSearchParams({ media: mediaIds.join(","), date: publishDate, time: publishTime })}`);
  }
  async function unlockDraft() {
    setDraftLocked(false);
    if (draftId.current) {
      await fetch(`/api/app/studio/drafts/${draftId.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "drafting" }),
      }).catch(() => {});
    }
  }
  const editGuard = useEditGuard(draftLocked, () => void unlockDraft());
  const [campaignName, setCampaignName] = useState(() => initialDraft?.campaignName ?? "");
  const [publishDate, setPublishDate] = useState(() => initialDraft?.publishDate ?? new Date().toISOString().slice(0, 10));
  const [publishTime, setPublishTime] = useState(() => initialDraft?.publishTime ?? new Date().toTimeString().slice(0, 5));
  const earliestPublishDate = localDateInputValue();
  const earliestPublishTime = nextMinuteInputValue();
  const publishScheduleIsPast = !draftLocked && isPastSchedule(publishDate, publishTime);
  const publishScheduleIsPastToday = !draftLocked && isPastToday(publishDate, publishTime);

  function updatePublishDate(value: string) {
    if (!value || value < earliestPublishDate) return;
    setPublishDate(value);
    if (value === earliestPublishDate && publishTime < earliestPublishTime) {
      setPublishTime(earliestPublishTime);
    }
  }

  function updatePublishTime(value: string) {
    if (!value || (publishDate === earliestPublishDate && value < earliestPublishTime)) return;
    setPublishTime(value);
  }

  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  // Per-platform post captions — one box per selected destination platform,
  // same shape/AI-fill flow as grid-2x2's. `caption` above is just the brief
  // fed to Auto-fill, not sent anywhere itself.
  const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>(() => initialDraft?.platformCaptions ?? {});
  const [captionLength, setCaptionLength] = useState<"short" | "medium" | "long">(() => initialDraft?.captionLength ?? "medium");
  const [captionBusy, setCaptionBusy] = useState<Record<string, boolean>>({});
  const [captionError, setCaptionError] = useState<Record<string, string>>({});
  const [toneResults, setToneResults] = useState<Record<string, AiToneResult>>({});
  const [improveBusy, setImproveBusy] = useState<Record<string, boolean>>({});
  async function generateCaption(platformId: string) {
    if (captionBusy[platformId] || !caption.trim()) return;
    setCaptionBusy((c) => ({ ...c, [platformId]: true }));
    setCaptionError((c) => ({ ...c, [platformId]: "" }));
    try {
      const res = await fetch("/api/app/studio/platform-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId, context: caption, campaignName, length: captionLength, format: "video" }),
      });
      const data = (await res.json()) as { text?: string; error?: { message?: string } };
      if (!res.ok || !data.text) throw new Error(data.error?.message ?? "Couldn't generate a caption.");
      setPlatformCaptions((c) => ({ ...c, [platformId]: data.text as string }));
      setToneResults((r) => {
        const next = { ...r };
        delete next[platformId];
        return next;
      });
    } catch (e) {
      setCaptionError((c) => ({ ...c, [platformId]: e instanceof Error ? e.message : "Couldn't generate a caption." }));
    } finally {
      setCaptionBusy((c) => ({ ...c, [platformId]: false }));
    }
  }
  function checkTone(platformId: string) {
    const text = platformCaptions[platformId] ?? "";
    if (!text.trim()) return;
    setToneResults((r) => ({ ...r, [platformId]: checkAiTone(text) }));
  }
  async function improveCaption(platformId: string) {
    const text = platformCaptions[platformId] ?? "";
    if (improveBusy[platformId] || !text.trim()) return;
    setImproveBusy((c) => ({ ...c, [platformId]: true }));
    try {
      const res = await fetch("/api/app/studio/improve-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId, text, flagged: toneResults[platformId]?.matches ?? [] }),
      });
      const data = (await res.json()) as { text?: string; error?: { message?: string } };
      if (res.ok && data.text) {
        setPlatformCaptions((c) => ({ ...c, [platformId]: data.text as string }));
        setToneResults((r) => ({ ...r, [platformId]: checkAiTone(data.text as string) }));
      }
    } finally {
      setImproveBusy((c) => ({ ...c, [platformId]: false }));
    }
  }
  const [editorTool, setEditorTool] = useState<"clip" | "trim" | "transition" | "volume" | "audio" | "captions">("clip");
  const [advancedCaptionOpen, setAdvancedCaptionOpen] = useState(false);
  // Seam N sits before segment N, so the first selectable seam is 1.
  const [selectedSeam, setSelectedSeam] = useState(1);
  const [seamDropTarget, setSeamDropTarget] = useState<number | null>(null);
  const [clipDropTarget, setClipDropTarget] = useState<number | null>(null);
  // Filmstrip tiles are a fixed pixel size, but the track is laid out in
  // percentages and grows with the zoom level, so measure it.
  const [timelineCanvasWidth, setTimelineCanvasWidth] = useState(0);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [frontPreviewLayer, setFrontPreviewLayer] = useState<"a" | "b">("a");
  const previewRef = useRef<HTMLVideoElement>(null);
  const transitionPreviewRef = useRef<HTMLVideoElement>(null);
  const captionFrameRef = useRef<HTMLDivElement>(null);
  const audioPreviewRefs = useRef(new Map<string, HTMLAudioElement>());
  const timelineCanvasRef = useRef<HTMLDivElement>(null);
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const audioLaneRef = useRef<HTMLDivElement>(null);
  const captionLaneRef = useRef<HTMLDivElement>(null);
  const toggleTimelinePlaybackRef = useRef<() => void>(() => undefined);
  const advancePreviewLayerRef = useRef<() => void>(() => undefined);
  const handoffInProgress = useRef(false);
  const gapPlaybackRef = useRef<{ position: number; startedAt: number } | null>(null);
  const timelineTrimDrag = useRef<{ side: "start" | "end"; startX: number; originalStart: number; originalEnd: number; maxEnd: number; secondsPerPixel: number; segmentOffset: number } | null>(null);
  const clipPositionDrag = useRef<{ id: string; startX: number; originalGap: number; secondsPerPixel: number } | null>(null);
  const seamDrag = useRef<{ index: number; startX: number; originalDuration: number; secondsPerPixel: number } | null>(null);
  // Dragging a caption block moves start/end together; dragging one of its
  // edge handles (side !== "move") trims just that edge — both share one ref
  // since only one caption can be dragged at a time.
  const captionDrag = useRef<{ id: string; side: "move" | "start" | "end"; pointerId: number; startX: number; originalStart: number; originalEnd: number; secondsPerPixel: number } | null>(null);
  const audioDrag = useRef<{ id: string; side: "move" | "start" | "end"; startX: number; originalStart: number; originalEnd: number; originalSourceStart: number; originalSourceEnd: number; secondsPerPixel: number } | null>(null);
  const [audioRowDropTarget, setAudioRowDropTarget] = useState<number | null>(null);
  const [captionRowDropTarget, setCaptionRowDropTarget] = useState<number | null>(null);
  // Manually reserved empty rows, from the "Add Row" button — on top of
  // whatever fadeRowPack needs for the clips that actually overlap in time.
  const [audioExtraRows, setAudioExtraRows] = useState(0);
  const [captionExtraRows, setCaptionExtraRows] = useState(0);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  // Timeline position currently being snapped to, mid-drag — drives the
  // white snap-indicator line. Null when not dragging or nothing's close enough.
  const [snapIndicator, setSnapIndicator] = useState<number | null>(null);
  const [detachPending, setDetachPending] = useState<{
    segmentId: string;
    action: FadeAttachedAudioAction;
    splitAt?: number;
  } | null>(null);
  const draftId = useRef<string | undefined>(initialDraftId);
  // Cmd/Ctrl+C/V clipboard for the timeline — a ref, not state, since copying
  // shouldn't trigger a render and the value only ever needs to be read back
  // synchronously inside the paste handler.
  const timelineClipboard = useRef<
    | { kind: "clip"; segment: FadeTimelineSegment }
    | { kind: "audio"; clip: FadeAudioClip }
    | { kind: "caption"; layer: FadeTextLayer }
    | null
  >(null);
  const buildReady = segments.length > 0 && selectedAccountIds.size > 0 && campaignName.trim().length > 0;
  // Continuing past Build only needs ONE rendered output to exist — not a
  // current render for every selected destination. rendersAreCurrent (the
  // per-platform staleness prop) still drives the Render/Re-render label so
  // users can see which destinations need a fresh render, just not whether
  // they're allowed to move on and add captions.
  const hasRenderedOutput = Object.keys(platformOutputMediaIds).length > 0;
  const buildHint = !campaignName.trim() ? "Add a campaign name to continue." : selectedAccountIds.size === 0 ? "Choose at least one destination under Post To." : segments.length === 0 ? "Upload a video to start building." : !hasRenderedOutput ? "Render the video to continue." : "";
  const schedule = new Date(`${publishDate}T${publishTime || "00:00"}`).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const goTo = (target: number) => { if (target <= step || (buildReady && hasRenderedOutput)) setStep(target); };
  const selectedPlatforms = Array.from(new Set([...selectedAccountIds].map((id) => accounts.find((account) => account.id === id)?.platform).filter((platform): platform is string => !!platform)));
  const currentPlatform = selectedPlatforms.includes(activePlatform) ? activePlatform : selectedPlatforms[0] ?? "";
  const transitionOverlaps = fadeTransitionOverlaps(segments);
  const segmentOffsets = fadeSegmentOffsets(segments);
  // "Start your edit" is a first-visit screen only. Once a clip has been added,
  // deleting them all leaves the editor mounted (it has its own Add Clip /
  // Upload / Library controls) instead of throwing the user back to a screen
  // that reads like their draft was reset. A ref, not state: it only ever
  // flips false -> true and is read in the same render that sets it.
  const hasAddedClip = useRef(segments.length > 0);
  if (segments.length > 0) hasAddedClip.current = true;
  // With every clip deleted the ruler still has to lay out whatever audio and
  // text rows are left over, so it needs a real span — fadeTimelineDuration's
  // 0.1s empty floor would stretch those rows to thousands of percent wide.
  const timelineDuration = segments.length > 0
    ? fadeTimelineDuration(segments)
    : Math.max(10, ...audioClips.map((clip) => clip.end), ...captionLayers.map((layer) => layer.end));
  const previewLocation = locateFadeTimelinePosition(segments, previewTime);
  const previewInGap = segments.length > 0 && previewLocation === null;
  const activeIndex = activeSegment ? segments.findIndex((segment) => segment.id === activeSegment.id) : -1;
  const activeOffset = activeIndex >= 0 ? segmentOffsets[activeIndex] : 0;
  const nextSegment = activeIndex >= 0 ? segments[activeIndex + 1] : undefined;
  const nextOffset = activeIndex >= 0 ? segmentOffsets[activeIndex + 1] : undefined;
  const nextSeam = segmentSeam(nextSegment);
  const activeTransitionOverlap = nextSegment ? transitionOverlaps[activeIndex + 1] ?? 0 : 0;
  const transitionProgress = activeTransitionOverlap > 0 && nextOffset !== undefined
    ? Math.min(1, Math.max(0, (previewTime - nextOffset) / activeTransitionOverlap))
    : 0;
  const { waveforms: waveformPeaks, durations: waveformDurations } = useFadeWaveforms([...segments.map((segment) => segment.media.id), ...audioClips.map((clip) => clip.mediaId)]);
  const filmstrips = useFadeFilmstrips(segments.map((segment) => segment.media.id));
  // Seam index 0 is the opening (fade in from black); segments.length is the
  // closing (fade out to black), which has no segment to live on, hence the
  // special case here rather than in segmentSeam itself.
  const getSeam = (index: number) => index === segments.length ? closingSeam : segmentSeam(segments[index]);
  const seamIndex = Math.min(Math.max(0, selectedSeam), Math.max(0, segments.length));
  const activeSeam = getSeam(seamIndex);
  const hasSeams = segments.length > 1;

  /** Apply a transition to a seam (0 = opening, segments.length = closing).
   *  Keeps the current length when swapping — a fresh transition (replacing a
   *  cut) starts at the default. */
  const applySeamTransition = (index: number, id: TransitionId) => {
    if (index < 0 || index > segments.length) return;
    const existing = getSeam(index);
    beginEditorEdit();
    setSegmentSeam(index, { type: id, duration: existing.type === "cut" ? transitionDuration : existing.duration });
    setSelectedSeam(index);
    setSelectedCaptionId(null);
    setSelectedAudioClipId(null);
    setEditorTool("transition");
  };
  const transitionDragged = (event: React.DragEvent) => event.dataTransfer.types.includes(TRANSITION_DND_TYPE);
  const clipDragged = (event: React.DragEvent) => event.dataTransfer.types.includes(CLIP_DND_TYPE);
  /** Which seam a drop on clip `index` means — measured against the clip's own
   *  box, since the drop may land on the filmstrip or label child. */
  const nearestSeam = (event: React.DragEvent<HTMLElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX - rect.left > rect.width / 2 ? index + 1 : index;
  };

  useEffect(() => {
    handoffInProgress.current = false;
  }, [activeSegment?.id]);

  useEffect(() => {
    const outgoing = previewRef.current;
    const incoming = transitionPreviewRef.current;
    if (outgoing) outgoing.volume = Math.min(1, Math.max(0, (activeSegment?.volume ?? 1) * (1 - transitionProgress)));
    if (!incoming || !nextSegment) {
      return;
    }
    const targetTime = nextSegment.start + transitionProgress * activeTransitionOverlap;
    if (Math.abs(incoming.currentTime - targetTime) > 0.12) incoming.currentTime = targetTime;
    incoming.volume = Math.min(1, Math.max(0, (nextSegment.volume ?? 1) * (nextSeam.type === "cut" ? 1 : transitionProgress)));
    if (timelinePlaying && transitionProgress > 0) void incoming.play().catch(() => undefined);
    else incoming.pause();
  }, [activeSegment, nextSegment, nextSeam.type, transitionProgress, activeTransitionOverlap, timelinePlaying]);

  useEffect(() => {
    const canvas = timelineCanvasRef.current;
    const viewport = timelineViewportRef.current;
    if (!canvas || !viewport) return;
    const canvasObserver = new ResizeObserver(([entry]) => setTimelineCanvasWidth(entry.contentRect.width));
    const viewportObserver = new ResizeObserver(([entry]) => setTimelineViewportWidth(entry.contentRect.width));
    canvasObserver.observe(canvas);
    viewportObserver.observe(viewport);
    return () => {
      canvasObserver.disconnect();
      viewportObserver.disconnect();
    };
  }, [step]);

  // Stopping the timeline has to stop the media, wherever the stop came from.
  // Leaving this to each caller is how a trimmed last clip kept playing past
  // its out point: that path flipped the flag but never paused the element.
  useEffect(() => {
    if (timelinePlaying) return;
    previewRef.current?.pause();
    transitionPreviewRef.current?.pause();
    audioPreviewRefs.current.forEach((audio) => audio.pause());
  }, [timelinePlaying]);

  useEffect(() => {
    audioClips.forEach((clip) => {
      const audio = audioPreviewRefs.current.get(clip.id);
      if (!audio) return;
      const active = previewTime >= clip.start && previewTime < clip.end;
      if (!active) {
        audio.pause();
        return;
      }
      const sourceTime = clip.sourceStart + (previewTime - clip.start);
      if (Math.abs(audio.currentTime - sourceTime) > 0.2) audio.currentTime = sourceTime;
      audio.volume = Math.min(1, Math.max(0, clip.volume));
      if (timelinePlaying && audio.paused) void audio.play().catch(() => undefined);
      if (!timelinePlaying) audio.pause();
    });
  }, [audioClips, previewTime, timelinePlaying]);

  useEffect(() => {
    if (
      audioRowDropTarget !== null &&
      (!audioDrag.current || !audioClips.some((clip) => clip.id === audioDrag.current?.id))
    ) {
      audioDrag.current = null;
      setAudioRowDropTarget(null);
    }
  }, [audioClips, audioRowDropTarget]);

  useEffect(() => {
    if (
      captionRowDropTarget !== null &&
      (!captionDrag.current || !captionLayers.some((layer) => layer.id === captionDrag.current?.id))
    ) {
      captionDrag.current = null;
      setCaptionRowDropTarget(null);
    }
  }, [captionLayers, captionRowDropTarget]);

  useEffect(() => {
    if (!timelinePlaying) return;
    let frame = 0;
    const updatePlayhead = () => {
      const gapPlayback = gapPlaybackRef.current;
      if (gapPlayback) {
        const position = Math.min(
          timelineDuration,
          gapPlayback.position + (performance.now() - gapPlayback.startedAt) / 1000,
        );
        const located = locateFadeTimelinePosition(segments, position);
        setPreviewTime(position);
        if (located) {
          gapPlaybackRef.current = null;
          handoffInProgress.current = false;
          setActiveSegmentId(located.segment.id);
          setSplitAt(located.sourceTime);
          if (activeSegment?.id === located.segment.id && previewRef.current) {
            previewRef.current.currentTime = located.sourceTime;
            void previewRef.current.play().catch(() => undefined);
          }
        } else if (position >= timelineDuration) {
          gapPlaybackRef.current = null;
          setTimelinePlaying(false);
        }
        frame = window.requestAnimationFrame(updatePlayhead);
        return;
      }
      const video = previewRef.current;
      if (video && activeSegment) {
        // The out point is checked here rather than on `timeupdate`, which
        // browsers fire only ~4x/second — a trimmed clip would overrun its
        // out point by up to a quarter second before handing over.
        if (video.currentTime >= (activeSegment.end ?? activeSegment.duration ?? Number.POSITIVE_INFINITY) - 0.015) {
          advancePreviewLayerRef.current();
        } else {
          setPreviewTime(Math.min(timelineDuration, activeOffset + Math.max(0, video.currentTime - activeSegment.start)));
        }
      }
      frame = window.requestAnimationFrame(updatePlayhead);
    };
    frame = window.requestAnimationFrame(updatePlayhead);
    return () => window.cancelAnimationFrame(frame);
  }, [timelinePlaying, activeSegment, activeOffset, timelineDuration, segments]);

  useEffect(() => {
    if (!timelinePlaying) return;
    const viewport = timelineViewportRef.current;
    const canvas = timelineCanvasRef.current;
    if (!viewport || !canvas) return;
    const playheadX = (previewTime / timelineDuration) * canvas.scrollWidth;
    const rightEdge = viewport.scrollLeft + viewport.clientWidth - 72;
    if (playheadX > rightEdge || playheadX < viewport.scrollLeft + 24) {
      viewport.scrollTo({ left: Math.max(0, playheadX - viewport.clientWidth * 0.35), behavior: "smooth" });
    }
  }, [previewTime, timelineDuration, timelinePlaying]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    const canvas = timelineCanvasRef.current;
    if (!viewport || !canvas) return;
    const frame = window.requestAnimationFrame(() => {
      const playheadX = (previewTime / timelineDuration) * canvas.scrollWidth;
      viewport.scrollLeft = Math.max(0, playheadX - viewport.clientWidth / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [timelineZoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (step !== 0 || target?.closest("input, textarea, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      const commandModifier = event.metaKey || event.ctrlKey;
      if (commandModifier && !event.altKey) {
        const undoShortcut = key === "z" && !event.shiftKey;
        const redoShortcut =
          (key === "z" && event.shiftKey) ||
          (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey);
        if (undoShortcut && canUndo) {
          event.preventDefault();
          undo();
          return;
        }
        if (redoShortcut && canRedo) {
          event.preventDefault();
          redo();
          return;
        }
        if (key === "c") {
          if (editorTool === "captions" && selectedCaptionId) {
            const layer = captionLayers.find((item) => item.id === selectedCaptionId);
            if (layer) {
              event.preventDefault();
              timelineClipboard.current = { kind: "caption", layer };
            }
          } else if (editorTool === "audio" && selectedAudioClipId) {
            const clip = audioClips.find((item) => item.id === selectedAudioClipId);
            if (clip) {
              event.preventDefault();
              timelineClipboard.current = { kind: "audio", clip };
            }
          } else if ((editorTool === "clip" || editorTool === "trim") && activeSegment) {
            event.preventDefault();
            timelineClipboard.current = { kind: "clip", segment: activeSegment };
          }
          return;
        }
        // Paste always uses whatever's in the clipboard, regardless of which
        // tool is active right now — matching how copy/paste works everywhere
        // else, rather than requiring the matching tool to be selected first.
        if (key === "v" && timelineClipboard.current) {
          const clipboard = timelineClipboard.current;
          event.preventDefault();
          if (clipboard.kind === "caption") {
            beginEditorEdit();
            const duration = clipboard.layer.end - clipboard.layer.start;
            const start = previewTime;
            const end = start + duration;
            const rows = fadeCaptionRows(captionLayers);
            const originalRow = rows.findIndex((row) => row.some((item) => item.id === clipboard.layer.id));
            const row = fadeFirstAvailableRowFrom(rows, start, end, originalRow >= 0 ? originalRow : rows.length);
            const pasted: FadeTextLayer = { ...clipboard.layer, id: crypto.randomUUID(), start, end, row };
            setCaptionLayers((current) => [...current, pasted]);
            setSelectedCaptionId(pasted.id);
            setSelectedAudioClipId(null);
            setEditorTool("captions");
          } else if (clipboard.kind === "audio") {
            beginEditorEdit();
            const duration = clipboard.clip.end - clipboard.clip.start;
            const start = previewTime;
            const end = start + duration;
            const rows = fadeAudioRows(audioClips);
            const originalRow = rows.findIndex((row) => row.some((item) => item.id === clipboard.clip.id));
            const row = fadeFirstAvailableRowFrom(rows, start, end, originalRow >= 0 ? originalRow : rows.length);
            const pasted: FadeAudioClip = { ...clipboard.clip, id: crypto.randomUUID(), start, end, row };
            setAudioClips((current) => [...current, pasted]);
            setSelectedAudioClipId(pasted.id);
            setSelectedCaptionId(null);
            setEditorTool("audio");
          } else {
            const located = locateFadeTimelinePosition(segments, previewTime);
            pasteSegment(clipboard.segment, located?.segment.id ?? null);
            setEditorTool("clip");
          }
          return;
        }
      }
      // Space also backs off a focused button (so it doesn't just re-click
      // whatever was last clicked, the standard browser behavior) — Delete
      // has no such conflict, so a focused "Add Text Overlay"/toolbar button
      // shouldn't block it.
      if (event.code === "Space") {
        if (target?.closest("button") || segments.length === 0) return;
        event.preventDefault();
        toggleTimelinePlaybackRef.current();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (editorTool === "transition" && activeSeam.type !== "cut") {
          event.preventDefault();
          beginEditorEdit();
          setSegmentSeam(seamIndex, { type: "cut", duration: transitionDuration });
        } else if (editorTool === "captions" && selectedCaptionId) {
          event.preventDefault();
          beginEditorEdit();
          setCaptionLayers((current) => current.filter((layer) => layer.id !== selectedCaptionId));
          setSelectedCaptionId(null);
        } else if (editorTool === "audio" && selectedAudioClipId) {
          event.preventDefault();
          beginEditorEdit();
          setAudioClips((current) => current.filter((clip) => clip.id !== selectedAudioClipId));
          setSelectedAudioClipId(null);
        } else if (editorTool === "volume" && activeSegment) {
          event.preventDefault();
          setDetachPending({ segmentId: activeSegment.id, action: "delete" });
        } else if (activeSegment) {
          event.preventDefault();
          removeActive();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, segments, editorTool, selectedCaptionId, selectedAudioClipId, activeSegment, activeSeam.type, seamIndex, transitionDuration, captionLayers, audioClips, previewTime, beginEditorEdit, removeActive, pasteSegment, undo, redo, canUndo, canRedo, setCaptionLayers, setSelectedCaptionId, setAudioClips, setSelectedAudioClipId, setSegmentSeam, setEditorTool]);

  useEffect(() => {
    if (!campaignName.trim() && segments.length === 0) return;
    const timer = window.setTimeout(async () => {
      setDraftStatus("saving");
      try {
        const response = await fetch("/api/app/studio/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftId.current,
            template: "fade-in",
            mode: "custom",
            title: campaignName || UNTITLED_DRAFT_TITLE,
            cover_image_url: null,
            state: { step, campaignName, segments, transition, transitionDuration, closingSeam, caption, publishDate, publishTime, selectedAccountIds: [...selectedAccountIds], activePlatform, platformFormatIds, platformOutputMediaIds, renderSignatures, captionLayers, audioClips, platformCaptions, captionLength },
          }),
        });
        if (!response.ok) throw new Error("Draft save failed.");
        const draft = await response.json();
        draftId.current = draft.id;
        setDraftStatus("saved");
      } catch { setDraftStatus("idle"); }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [step, campaignName, segments, transition, transitionDuration, closingSeam, caption, publishDate, publishTime, selectedAccountIds, activePlatform, platformFormatIds, platformOutputMediaIds, renderSignatures, captionLayers, audioClips, platformCaptions, captionLength]);

  if (step === 0) {
    const selectedCaptionLayer = captionLayers.find((layer) => layer.id === selectedCaptionId) ?? null;
    const selectedAudioClip = audioClips.find((clip) => clip.id === selectedAudioClipId) ?? null;
    const audioRows = fadeAudioRows(audioClips);
    const audioRowCount = audioRows.length + audioExtraRows + (audioRowDropTarget !== null ? 1 : 0);
    const captionRows = fadeCaptionRows(captionLayers);
    const captionRowCount = captionRows.length + captionExtraRows + (captionRowDropTarget !== null ? 1 : 0);
    const compactTimelineRuler = timelineZoom <= 0.5;
    const fixedLaneControlWidth = Math.max(
      160,
      Math.min(Math.max(160, timelineCanvasWidth - 8), Math.max(160, timelineViewportWidth - FADE_TIMELINE_GUTTER_WIDTH - 10)),
    );
    const patchCaption = (patch: Partial<FadeTextLayer>) => {
      if (!selectedCaptionLayer) return;
      const id = selectedCaptionLayer.id;
      setCaptionLayers((current) => current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    };
    const currentAspect = currentPlatform ? fadeFormatFor(currentPlatform, platformFormatIds).aspect : VIDEO_ASPECTS[0];
    const currentCrop = activeSegment?.crops[currentPlatform] ?? activeSegment?.crops.default ?? { x: 0.5, y: 0.5 };
    const nextCrop = nextSegment?.crops[currentPlatform] ?? nextSegment?.crops.default ?? { x: 0.5, y: 0.5 };
    // The whole seam simulation comes out of the shared catalog, so every
    // transition the library offers previews without a branch here.
    const seamPreview = transitionPreviewStyles(nextSeam.type, transitionProgress);
    // Opening/closing reuse the same simulation. Both only ever touch the
    // first/last segment and are clamped (server-side) to at most half that
    // segment's own duration, so they never overlap in time with an
    // inter-clip transition — safe to layer straight onto mainTransitionStyle
    // rather than the two-layer machinery interior seams need (there's no
    // second real clip on the opposite side, just black).
    const openingSeamNow = getSeam(0);
    const openingProgress = openingSeamNow.duration > 0 ? Math.min(1, Math.max(0, previewTime / openingSeamNow.duration)) : 1;
    const opening = activeIndex === 0 && openingSeamNow.type !== "cut" && previewTime < openingSeamNow.duration
      ? transitionPreviewStyles(openingSeamNow.type, openingProgress)
      : null;
    const isLastSegment = activeIndex === segments.length - 1;
    const closingStart = Math.max(0, timelineDuration - closingSeam.duration);
    const closingProgress = closingSeam.duration > 0 ? Math.min(1, Math.max(0, (previewTime - closingStart) / closingSeam.duration)) : 0;
    const closing = isLastSegment && closingSeam.type !== "cut" && previewTime > closingStart
      ? transitionPreviewStyles(closingSeam.type, closingProgress)
      : null;
    const mainTransitionStyle: React.CSSProperties = {
      objectPosition: `${currentCrop.x * 100}% ${currentCrop.y * 100}%`,
      transform: "translateX(0)",
      clipPath: "inset(0 0 0 0)",
      ...seamPreview.outgoing,
      ...(opening?.incoming ?? {}),
      ...(closing?.outgoing ?? {}),
      opacity: (opening?.incoming.opacity ?? 1) * (closing?.outgoing.opacity ?? 1) * (seamPreview.outgoing.opacity ?? 1),
    };
    const incomingTransitionStyle: React.CSSProperties = {
      objectPosition: `${nextCrop.x * 100}% ${nextCrop.y * 100}%`,
      opacity: 0,
      transform: "translateX(0)",
      clipPath: "inset(0 0 0 0)",
      ...seamPreview.incoming,
    };
    const outgoingOnTop = seamPreview.swapLayers === true;
    const layerASegment = frontPreviewLayer === "a" ? activeSegment : nextSegment;
    const layerBSegment = frontPreviewLayer === "b" ? activeSegment : nextSegment;
    const layerZ = (isOutgoing: boolean) => (isOutgoing === outgoingOnTop ? 2 : 1);
    const layerAStyle = { ...(frontPreviewLayer === "a" ? mainTransitionStyle : incomingTransitionStyle), zIndex: layerZ(frontPreviewLayer === "a") };
    const layerBStyle = { ...(frontPreviewLayer === "b" ? mainTransitionStyle : incomingTransitionStyle), zIndex: layerZ(frontPreviewLayer === "b") };
    const advancePreviewLayer = () => {
      if (handoffInProgress.current) return;
      const next = segments[activeIndex + 1];
      if (!next) {
        gapPlaybackRef.current = null;
        audioPreviewRefs.current.forEach((audio) => audio.pause());
        setPreviewTime(timelineDuration);
        setTimelinePlaying(false);
        return;
      }
      const nextGap = Math.max(0, next.gapBefore ?? 0);
      if (nextGap > 0) {
        handoffInProgress.current = true;
        previewRef.current?.pause();
        transitionPreviewRef.current?.pause();
        const gapStart = Math.max(0, (segmentOffsets[activeIndex + 1] ?? 0) - nextGap);
        setPreviewTime(gapStart);
        gapPlaybackRef.current = { position: gapStart, startedAt: performance.now() };
        return;
      }
      handoffInProgress.current = true;
      const overlap = transitionOverlaps[activeIndex + 1] ?? 0;
      const incoming = transitionPreviewRef.current;
      if (incoming) {
        const targetTime = next.start + overlap;
        if (Math.abs(incoming.currentTime - targetTime) > 0.08) {
          incoming.currentTime = targetTime;
        }
        incoming.volume = Math.min(1, Math.max(0, next.volume ?? 1));
        if (timelinePlaying) void incoming.play().catch(() => undefined);
      }
      previewRef.current?.pause();
      setFrontPreviewLayer((current) => current === "a" ? "b" : "a");
      setActiveSegmentId(next.id);
      setSplitAt(next.start + overlap);
      setPreviewTime((segmentOffsets[activeIndex + 1] ?? 0) + overlap);
    };
    const handlePreviewTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
      if (event.currentTarget !== previewRef.current) return;
      const sourceTime = event.currentTarget.currentTime;
      setPreviewTime(activeOffset + Math.max(0, sourceTime - (activeSegment?.start ?? 0)));
      setSplitAt(sourceTime);
      // Only auto-advance during real playback. Trimming the end handle seeks
      // the preview to end-0.01 on every drag step to keep it in sync — which
      // is already past this same "within 0.015s of the end" threshold, so
      // without the timelinePlaying guard, dragging the handle even slightly
      // immediately advances to the next clip, deselects this one, unmounts
      // its trim handles mid-drag, and strands the pointer capture on a node
      // that no longer exists — the drag silently stops responding.
      if (timelinePlaying && activeSegment && sourceTime >= (activeSegment.end ?? activeSegment.duration ?? Number.POSITIVE_INFINITY) - 0.015) {
        advancePreviewLayer();
      }
    };
    const handleLayerLoaded = (event: React.SyntheticEvent<HTMLVideoElement>, isActiveLayer: boolean, segment: FadeTimelineSegment | null | undefined) => {
      if (!segment) return;
      if (isActiveLayer) {
        const end = segment.end ?? segment.duration ?? segment.start;
        event.currentTarget.currentTime = Math.min(end, Math.max(segment.start, splitAt));
        // A freshly loaded element defaults to volume 1 — set it from the
        // segment's own (possibly muted) volume before play() can start it
        // audible, rather than waiting on the volume-sync effect's next run.
        event.currentTarget.volume = Math.min(1, Math.max(0, (segment.volume ?? 1) * (1 - transitionProgress)));
        if (timelinePlaying) void event.currentTarget.play().catch(() => undefined);
      } else {
        event.currentTarget.currentTime = segment.start + transitionProgress * activeTransitionOverlap;
        event.currentTarget.volume = Math.min(1, Math.max(0, (segment.volume ?? 1) * (nextSeam.type === "cut" ? 1 : transitionProgress)));
        if (timelinePlaying && transitionProgress > 0) void event.currentTarget.play().catch(() => undefined);
      }
    };
    const playTimeline = () => {
      if (timelinePlaying) {
        previewRef.current?.pause();
        transitionPreviewRef.current?.pause();
        audioPreviewRefs.current.forEach((audio) => audio.pause());
        gapPlaybackRef.current = null;
        setTimelinePlaying(false);
        return;
      }
      const position = previewTime >= timelineDuration - 0.05 ? 0 : previewTime;
      const located = locateFadeTimelinePosition(segments, position);
      setTimelinePlaying(true);
      if (!located) {
        previewRef.current?.pause();
        transitionPreviewRef.current?.pause();
        gapPlaybackRef.current = { position, startedAt: performance.now() };
        setPreviewTime(position);
        return;
      }
      gapPlaybackRef.current = null;
      setActiveSegmentId(located.segment.id);
      setSplitAt(located.sourceTime);
      setPreviewTime(position);
      if (activeSegment?.id === located.segment.id && previewRef.current) {
        previewRef.current.currentTime = located.sourceTime;
        previewRef.current.volume = Math.min(1, Math.max(0, activeSegment.volume ?? 1));
        void previewRef.current.play();
      }
    };
    const seekTimeline = (position: number) => {
      const targetTime = Math.min(timelineDuration, Math.max(0, position));
      previewRef.current?.pause();
      transitionPreviewRef.current?.pause();
      audioPreviewRefs.current.forEach((audio) => audio.pause());
      gapPlaybackRef.current = null;
      setTimelinePlaying(false);
      const located = locateFadeTimelinePosition(segments, targetTime);
      setPreviewTime(targetTime);
      if (!located) return;
      setActiveSegmentId(located.segment.id);
      setSplitAt(located.sourceTime);
      if (activeSegment?.id === located.segment.id && previewRef.current) previewRef.current.currentTime = located.sourceTime;
    };
    const seekFromTimelinePointer = (clientX: number) => {
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      seekTimeline(((clientX - rect.left) / rect.width) * timelineDuration);
    };
    const previewFrom = (position: number) => {
      seekTimeline(position);
      window.setTimeout(() => toggleTimelinePlaybackRef.current(), 0);
    };
    // Where to seek to preview seam `index`: just before an interior seam's
    // overlap, right at the start for the opening, or just before the black
    // tail begins for the closing.
    const seamPreviewSeekPosition = (index: number) => {
      if (index === 0) return 0;
      if (index === segments.length) return Math.max(0, timelineDuration - closingSeam.duration - 0.25);
      return Math.max(0, (segmentOffsets[index] ?? 0) - 0.25);
    };
    const beginClipPositionDrag = (
      event: React.PointerEvent<HTMLElement>,
      segment: FadeTimelineSegment,
    ) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("[data-trim-handle], [data-clip-reorder]")) return;
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      beginEditorEdit();
      event.currentTarget.setPointerCapture(event.pointerId);
      clipPositionDrag.current = {
        id: segment.id,
        startX: event.clientX,
        originalGap: Math.max(0, segment.gapBefore ?? 0),
        secondsPerPixel: timelineDuration / rect.width,
      };
      // seekFromTimelinePointer below also resolves (and sets) an active
      // segment from the raw click position — but the segment the user
      // actually clicked is the one true answer, so it's set again after,
      // winning over whatever that position-based lookup landed on.
      seekFromTimelinePointer(event.clientX);
      setActiveSegmentId(segment.id);
      setSelectedCaptionId(null);
      setSelectedAudioClipId(null);
      setEditorTool("clip");
    };
    const moveClipPositionDrag = (event: React.PointerEvent<HTMLElement>) => {
      const drag = clipPositionDrag.current;
      if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const rawGap = drag.originalGap + (event.clientX - drag.startX) * drag.secondsPerPixel;
      let gapBefore = Math.round(clamp(rawGap, 0, 60) * 20) / 20;
      if (snappingEnabled) {
        const index = segments.findIndex((segment) => segment.id === drag.id);
        // segmentOffsets reflects the gap as of the last render (drag.originalGap
        // hasn't shifted it yet this frame), so the constant part of the offset —
        // everything except the gap itself — is just offset minus that gap.
        const base = index >= 0 ? segmentOffsets[index] - drag.originalGap : 0;
        const rawStart = base + rawGap;
        const snapThreshold = 8 * drag.secondsPerPixel;
        const targets = fadeSnapTargets({ segments, segmentOffsets, audioClips, captionLayers, previewTime, timelineDuration, excludeSegmentId: drag.id });
        const snappedStart = fadeSnap(rawStart, targets, snapThreshold);
        setSnapIndicator(snappedStart !== rawStart ? snappedStart : null);
        gapBefore = Math.max(0, Math.min(60, snappedStart - base));
      }
      setSegmentGap(drag.id, gapBefore);
    };
    const endClipPositionDrag = (event: React.PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      clipPositionDrag.current = null;
      setSnapIndicator(null);
    };
    const beginTimelineTrim = (event: React.PointerEvent<HTMLElement>, segment: FadeTimelineSegment, side: "start" | "end", segmentOffset: number) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || activeSegment?.id !== segment.id) return;
      previewRef.current?.pause();
      transitionPreviewRef.current?.pause();
      audioPreviewRefs.current.forEach((audio) => audio.pause());
      setTimelinePlaying(false);
      beginEditorEdit();
      event.currentTarget.setPointerCapture(event.pointerId);
      timelineTrimDrag.current = {
        side,
        startX: event.clientX,
        originalStart: segment.start,
        originalEnd: segment.end ?? segment.duration ?? segment.start + 0.1,
        maxEnd: segment.duration ?? segment.end ?? segment.start + 0.1,
        secondsPerPixel: timelineDuration / rect.width,
        segmentOffset,
      };
      setEditorTool("trim");
    };
    // Dragging a seam chip sideways stretches that one transition, the way the
    // Flixier blue outline does.
    const beginSeamDrag = (event: React.PointerEvent<HTMLElement>, index: number) => {
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const seam = getSeam(index);
      if (seam.type === "cut") return;
      event.stopPropagation();
      beginEditorEdit();
      event.currentTarget.setPointerCapture(event.pointerId);
      seamDrag.current = { index, startX: event.clientX, originalDuration: seam.duration, secondsPerPixel: timelineDuration / rect.width };
      setSelectedSeam(index);
      setEditorTool("transition");
    };
    const moveSeamDrag = (event: React.PointerEvent<HTMLElement>) => {
      const drag = seamDrag.current;
      if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const seam = getSeam(drag.index);
      // Every seam except the opening grows by dragging left — its right edge
      // is pinned to the outgoing clip's end. The opening seam is pinned at
      // the *left* edge (0%, nothing precedes it), so for it alone, dragging
      // right is what lengthens it — the sign flips only for index 0.
      const sign = drag.index === 0 ? 1 : -1;
      setSegmentSeam(drag.index, { type: seam.type, duration: clampTransitionDuration(drag.originalDuration + sign * (event.clientX - drag.startX) * drag.secondsPerPixel) });
    };
    const endSeamDrag = (event: React.PointerEvent<HTMLElement>) => {
      seamDrag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const moveTimelineTrim = (event: React.PointerEvent<HTMLElement>) => {
      const drag = timelineTrimDrag.current;
      if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const delta = (event.clientX - drag.startX) * drag.secondsPerPixel;
      if (drag.side === "start") {
        const start = Math.min(drag.originalEnd - 0.1, Math.max(0, drag.originalStart + delta));
        setActiveTrim(start, drag.originalEnd);
        setSplitAt(start);
        setPreviewTime(drag.segmentOffset);
        if (previewRef.current) previewRef.current.currentTime = start;
      } else {
        const end = Math.min(drag.maxEnd, Math.max(drag.originalStart + 0.1, drag.originalEnd + delta));
        setActiveTrim(drag.originalStart, end);
        setSplitAt(end);
        setPreviewTime(drag.segmentOffset + end - drag.originalStart);
        if (previewRef.current) previewRef.current.currentTime = Math.max(drag.originalStart, end - 0.01);
      }
    };
    const endTimelineTrim = (event: React.PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      timelineTrimDrag.current = null;
    };
    const beginCaptionDrag = (event: React.PointerEvent<HTMLElement>, layer: FadeTextLayer, side: "move" | "start" | "end", rowIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      beginEditorEdit();
      event.currentTarget.setPointerCapture(event.pointerId);
      captionDrag.current = { id: layer.id, side, pointerId: event.pointerId, startX: event.clientX, originalStart: layer.start, originalEnd: layer.end, secondsPerPixel: timelineDuration / rect.width };
      if (side === "move") {
        setCaptionLayers((current) => current.map((item) => item.id === layer.id ? { ...item, row: rowIndex } : item));
        setCaptionRowDropTarget(rowIndex);
      }
      setSelectedCaptionId(layer.id);
      setSelectedAudioClipId(null);
      setEditorTool("captions");
      // Selecting (or repositioning) an overlay leaves the playhead alone —
      // only trimming previews the edge being dragged, same as the video
      // clip trim handles.
      if (side !== "move") setPreviewTime(side === "start" ? layer.start : layer.end);
    };
    const moveCaptionDrag = (event: React.PointerEvent<HTMLElement>) => {
      const drag = captionDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const delta = (event.clientX - drag.startX) * drag.secondsPerPixel;
      const minDuration = 0.5;
      const lane = captionLaneRef.current;
      const laneRect = lane?.getBoundingClientRect();
      const targetRow =
        drag.side === "move" && lane && laneRect
          ? Math.round(clamp(
              Math.floor((event.clientY - laneRect.top + lane.scrollTop) / FADE_CAPTION_ROW_HEIGHT),
              0,
              captionRowCount - 1,
            ))
          : null;
      if (targetRow !== null) setCaptionRowDropTarget(targetRow);
      const snapThreshold = snappingEnabled ? 8 * drag.secondsPerPixel : 0;
      const snapTargets = snapThreshold > 0
        ? fadeSnapTargets({ segments, segmentOffsets, audioClips, captionLayers, previewTime, timelineDuration, excludeCaptionId: drag.id })
        : [];
      const snap = (raw: number) => (snapThreshold > 0 ? fadeSnap(raw, snapTargets, snapThreshold) : raw);
      let snappedTime: number | null = null;
      let nextStart = drag.originalStart;
      let nextEnd = drag.originalEnd;
      if (drag.side === "start") {
        const rawStart = clamp(drag.originalStart + delta, 0, drag.originalEnd - minDuration);
        nextStart = snap(rawStart);
        if (nextStart !== rawStart) snappedTime = nextStart;
        setPreviewTime(nextStart);
      } else if (drag.side === "end") {
        const rawEnd = clamp(drag.originalEnd + delta, drag.originalStart + minDuration, timelineDuration);
        nextEnd = snap(rawEnd);
        if (nextEnd !== rawEnd) snappedTime = nextEnd;
        setPreviewTime(nextEnd);
      } else {
        const span = drag.originalEnd - drag.originalStart;
        const rawStart = clamp(drag.originalStart + delta, 0, timelineDuration - span);
        nextStart = snap(rawStart);
        if (nextStart !== rawStart) snappedTime = nextStart;
        nextEnd = nextStart + span;
      }
      if (snappingEnabled) setSnapIndicator(snappedTime);
      setCaptionLayers((current) => current.map((layer) => {
        if (layer.id !== drag.id) return layer;
        if (drag.side === "move") return { ...layer, start: nextStart, end: nextEnd, ...(targetRow !== null ? { row: targetRow } : {}) };
        if (drag.side === "start") return { ...layer, start: nextStart };
        return { ...layer, end: nextEnd };
      }));
    };
    const endCaptionDrag = (event: React.PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      captionDrag.current = null;
      setSnapIndicator(null);
      setCaptionLayers((current) =>
        fadeCaptionRows(current)
          .filter((row) => row.length > 0)
          .flatMap((row, rowIndex) => row.map((layer) => ({ ...layer, row: rowIndex }))),
      );
      setCaptionRowDropTarget(null);
    };
    // Only ever called on a row with no layers in it (see the `rowEmpty`
    // check at the call site) — shifts every layer below it up one row to
    // close the gap. Only decrements the manually-reserved floor when the
    // deleted row was one of those trailing extra rows — a gap inside the
    // naturally-packed rows closes on its own once the shift above lands.
    const deleteCaptionRow = (rowIndex: number) => {
      beginEditorEdit();
      setCaptionLayers((current) => current.map((layer) =>
        Number.isInteger(layer.row) && (layer.row ?? 0) > rowIndex ? { ...layer, row: (layer.row ?? 0) - 1 } : layer,
      ));
      if (rowIndex >= captionRows.length) setCaptionExtraRows((current) => Math.max(0, current - 1));
    };
    function addCaptionLayer() {
      beginEditorEdit();
      const start = Math.min(previewTime, Math.max(0, timelineDuration - 0.5));
      const layer = makeFadeTextLayer({ start, end: Math.min(timelineDuration, start + 3) });
      setCaptionLayers((current) => [...current, layer]);
      setSelectedCaptionId(layer.id);
      setSelectedAudioClipId(null);
      setEditorTool("captions");
    }
    // Whole-block drag moves start/end together (source window unchanged);
    // the "start"/"end" trim handles move the source AND output window
    // together in lockstep (same idea as clip trims), unlike captions'
    // pure-output-position trimming — an audio clip's source window has to
    // move with it, or the trimmed-off audio would just play at the old spot.
    const beginAudioDrag = (
      event: React.PointerEvent<HTMLElement>,
      clip: FadeAudioClip,
      side: "move" | "start" | "end",
      rowIndex: number,
    ) => {
      event.stopPropagation();
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      beginEditorEdit();
      event.currentTarget.setPointerCapture(event.pointerId);
      audioDrag.current = { id: clip.id, side, startX: event.clientX, originalStart: clip.start, originalEnd: clip.end, originalSourceStart: clip.sourceStart, originalSourceEnd: clip.sourceEnd, secondsPerPixel: timelineDuration / rect.width };
      if (side === "move") {
        setAudioClips((current) => current.map((item) => item.id === clip.id ? { ...item, row: rowIndex } : item));
        setAudioRowDropTarget(rowIndex);
      }
      setSelectedAudioClipId(clip.id);
      setSelectedCaptionId(null);
      setEditorTool("audio");
      seekTimeline(clip.start);
    };
    const moveAudioDrag = (event: React.PointerEvent<HTMLElement>) => {
      const drag = audioDrag.current;
      if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const delta = (event.clientX - drag.startX) * drag.secondsPerPixel;
      const minDuration = 0.2;
      const lane = audioLaneRef.current;
      const laneRect = lane?.getBoundingClientRect();
      const targetRow =
        drag.side === "move" && lane && laneRect
          ? Math.round(clamp(
              Math.floor((event.clientY - laneRect.top + lane.scrollTop) / FADE_AUDIO_ROW_HEIGHT),
              0,
              audioRowCount - 1,
            ))
          : null;
      if (targetRow !== null) setAudioRowDropTarget(targetRow);
      const snapThreshold = snappingEnabled ? 8 * drag.secondsPerPixel : 0;
      const snapTargets = snapThreshold > 0
        ? fadeSnapTargets({ segments, segmentOffsets, audioClips, captionLayers, previewTime, timelineDuration, excludeAudioId: drag.id })
        : [];
      const snap = (raw: number) => (snapThreshold > 0 ? fadeSnap(raw, snapTargets, snapThreshold) : raw);
      const draggedClip = audioClips.find((item) => item.id === drag.id);
      const sourceDuration = draggedClip ? (waveformDurations[draggedClip.mediaId] ?? Infinity) : Infinity;
      let snappedTime: number | null = null;
      setAudioClips((current) => current.map((clip) => {
        if (clip.id !== drag.id) return clip;
        if (drag.side === "move") {
          const span = drag.originalEnd - drag.originalStart;
          const clampedDelta = clamp(delta, -drag.originalStart, timelineDuration - drag.originalEnd);
          const rawStart = drag.originalStart + clampedDelta;
          const start = snap(rawStart);
          if (start !== rawStart) snappedTime = start;
          return { ...clip, start, end: start + span, ...(targetRow !== null ? { row: targetRow } : {}) };
        }
        if (drag.side === "start") {
          const clampedDelta = clamp(delta, Math.max(-drag.originalStart, -drag.originalSourceStart), drag.originalEnd - minDuration - drag.originalStart);
          const rawStart = drag.originalStart + clampedDelta;
          const start = snap(rawStart);
          if (start !== rawStart) snappedTime = start;
          const shift = start - drag.originalStart;
          return { ...clip, start, sourceStart: drag.originalSourceStart + shift };
        }
        const clampedDelta = clamp(delta, drag.originalStart + minDuration - drag.originalEnd, Math.min(timelineDuration - drag.originalEnd, sourceDuration - drag.originalSourceEnd));
        const rawEnd = drag.originalEnd + clampedDelta;
        const end = snap(rawEnd);
        if (end !== rawEnd) snappedTime = end;
        const shift = end - drag.originalEnd;
        return { ...clip, end, sourceEnd: drag.originalSourceEnd + shift };
      }));
      if (snappingEnabled) setSnapIndicator(snappedTime);
    };
    const endAudioDrag = (event: React.PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      audioDrag.current = null;
      setSnapIndicator(null);
      setAudioClips((current) =>
        fadeAudioRows(current)
          .filter((row) => row.length > 0)
          .flatMap((row, rowIndex) => row.map((clip) => ({ ...clip, row: rowIndex }))),
      );
      setAudioRowDropTarget(null);
    };
    // Only ever called on a row with no clips in it (see the `rowEmpty`
    // check at the call site) — shifts every clip below it up one row to
    // close the gap. Only decrements the manually-reserved floor when the
    // deleted row was one of those trailing extra rows — a gap inside the
    // naturally-packed rows closes on its own once the shift above lands.
    const deleteAudioRow = (rowIndex: number) => {
      beginEditorEdit();
      setAudioClips((current) => current.map((clip) =>
        Number.isInteger(clip.row) && (clip.row ?? 0) > rowIndex ? { ...clip, row: (clip.row ?? 0) - 1 } : clip,
      ));
      if (rowIndex >= audioRows.length) setAudioExtraRows((current) => Math.max(0, current - 1));
    };
    // A still-attached segment's audio needs confirmation before it becomes
    // independent or is removed. Plain selection and volume changes stay inline.
    function requestDetach(
      segment: FadeTimelineSegment,
      action: FadeAttachedAudioAction = "detach",
      at?: number,
    ) {
      setDetachPending({ segmentId: segment.id, action, splitAt: at });
    }
    function confirmDetach() {
      if (!detachPending) return;
      const segment = segments.find((s) => s.id === detachPending.segmentId);
      const index = segments.findIndex((s) => s.id === detachPending.segmentId);
      if (segment && index !== -1) {
        beginEditorEdit();
        // Silence the live preview element immediately, rather than only
        // updating segment state and waiting on the volume-sync effect's next
        // run — belt-and-suspenders against any effect-timing gap, since an
        // audible clip playing on top of its own newly-detached track is a
        // much worse failure mode than a redundant volume=0 assignment.
        if (activeSegment?.id === segment.id && previewRef.current) previewRef.current.volume = 0;
        if (nextSegment?.id === segment.id && transitionPreviewRef.current) transitionPreviewRef.current.volume = 0;
        const offset = segmentOffsets[index];
        const duration = fadeSegmentDuration(segment);
        const clip: FadeAudioClip = {
          id: crypto.randomUUID(), kind: "detached", mediaId: segment.media.id, name: segment.media.name,
          sourceStart: segment.start, sourceEnd: segment.end ?? segment.duration ?? segment.start + duration,
          start: offset, end: offset + duration, volume: segment.volume ?? 1, sourceSegmentId: segment.id,
        };
        if (detachPending.action === "delete") {
          muteSegmentAudio(segment.id);
          setSelectedAudioClipId(null);
          setEditorTool("clip");
        } else if (detachPending.action === "split") {
          muteSegmentAudio(segment.id);
          const point = clamp(
            detachPending.splitAt ?? previewTime,
            clip.start + 0.1,
            clip.end - 0.1,
          );
          const sourcePoint = clip.sourceStart + (point - clip.start);
          const first = { ...clip, id: crypto.randomUUID(), end: point, sourceEnd: sourcePoint };
          const second = {
            ...clip,
            id: crypto.randomUUID(),
            start: point,
            sourceStart: sourcePoint,
          };
          setAudioClips((current) => {
            const row = fadeFirstAvailableAudioRow(current, first.start, second.end);
            return [...current, { ...first, row }, { ...second, row }];
          });
          setSelectedAudioClipId(second.id);
          setSelectedCaptionId(null);
          setEditorTool("audio");
        } else {
          muteSegmentAudio(segment.id);
          setAudioClips((current) => [
            ...current,
            { ...clip, row: fadeFirstAvailableAudioRow(current, clip.start, clip.end) },
          ]);
          setSelectedAudioClipId(clip.id);
          setSelectedCaptionId(null);
          setEditorTool("audio");
        }
      }
      setDetachPending(null);
    }
    const canSplitCaption =
      editorTool === "captions" &&
      !!selectedCaptionLayer &&
      previewTime >= selectedCaptionLayer.start + 0.5 &&
      previewTime <= selectedCaptionLayer.end - 0.5;
    const canSplitAudio =
      editorTool === "audio" &&
      !!selectedAudioClip &&
      previewTime >= selectedAudioClip.start + 0.1 &&
      previewTime <= selectedAudioClip.end - 0.1;
    const canSplitAttachedAudio =
      editorTool === "volume" &&
      !!activeSegment &&
      previewTime >= activeOffset + 0.1 &&
      previewTime <= activeOffset + fadeSegmentDuration(activeSegment) - 0.1;
    const activeSourceEnd = activeSegment?.end ?? activeSegment?.duration ?? 0;
    const canSplitVideo =
      !!activeSegment &&
      !!activeSegment.duration &&
      previewTime >= activeOffset + 0.1 &&
      previewTime <= activeOffset + fadeSegmentDuration(activeSegment) - 0.1 &&
      splitAt >= activeSegment.start + 0.1 &&
      splitAt <= activeSourceEnd - 0.1;
    const canSplitSelectedItem =
      canSplitCaption ||
      canSplitAudio ||
      canSplitAttachedAudio ||
      (!["captions", "audio", "volume"].includes(editorTool) && canSplitVideo);
    const splitTarget =
      editorTool === "captions"
        ? "text overlay"
        : editorTool === "audio" || editorTool === "volume"
          ? "audio clip"
          : "video clip";

    function splitSelectedItem() {
      if (canSplitCaption && selectedCaptionLayer) {
        beginEditorEdit();
        const first = {
          ...selectedCaptionLayer,
          id: crypto.randomUUID(),
          end: previewTime,
        };
        const second = {
          ...selectedCaptionLayer,
          id: crypto.randomUUID(),
          start: previewTime,
        };
        setCaptionLayers((current) =>
          current.flatMap((layer) =>
            layer.id === selectedCaptionLayer.id ? [first, second] : [layer],
          ),
        );
        setSelectedCaptionId(second.id);
        setSelectedAudioClipId(null);
        return;
      }
      if (canSplitAudio && selectedAudioClip) {
        beginEditorEdit();
        const sourcePoint = selectedAudioClip.sourceStart + (previewTime - selectedAudioClip.start);
        const first = {
          ...selectedAudioClip,
          id: crypto.randomUUID(),
          end: previewTime,
          sourceEnd: sourcePoint,
        };
        const second = {
          ...selectedAudioClip,
          id: crypto.randomUUID(),
          start: previewTime,
          sourceStart: sourcePoint,
        };
        setAudioClips((current) =>
          current.flatMap((clip) =>
            clip.id === selectedAudioClip.id ? [first, second] : [clip],
          ),
        );
        setSelectedAudioClipId(second.id);
        setSelectedCaptionId(null);
        return;
      }
      if (canSplitAttachedAudio && activeSegment) {
        requestDetach(activeSegment, "split", previewTime);
        return;
      }
      if (canSplitVideo) splitActive();
    }

    /** One audio clip block, shared by the detached and added-audio rows —
     *  they need identical drag/trim/select mechanics, just different rows. */
    // Audio detached from a clip keeps that clip's color (still "part of" it
    // visually); a standalone soundtrack clip gets its own color instead.
    function audioClipColor(clip: FadeAudioClip) {
      if (clip.kind === "detached" && clip.sourceSegmentId) {
        const segmentIndex = segments.findIndex((segment) => segment.id === clip.sourceSegmentId);
        if (segmentIndex >= 0) return fadeAccentColor(segmentIndex);
      }
      return fadeAccentColor(audioClips.findIndex((item) => item.id === clip.id));
    }
    function renderAudioBlock(clip: FadeAudioClip, top: number, height: number, rowIndex: number) {
      const left = (clip.start / timelineDuration) * 100;
      const width = ((clip.end - clip.start) / timelineDuration) * 100;
      const selected = editorTool === "audio" && selectedAudioClipId === clip.id;
      const sourceDuration = waveformDurations[clip.mediaId] || clip.sourceEnd || 1;
      const color = audioClipColor(clip);
      return <div key={clip.id} role="button" tabIndex={0}
        aria-label={`${clip.kind === "soundtrack" ? "Audio clip" : "Detached audio"} "${clip.name}", row ${rowIndex + 1}, ${formatFadeTime(clip.end - clip.start, true)}`}
        onPointerDown={(event) => beginAudioDrag(event, clip, "move", rowIndex)}
        onPointerMove={moveAudioDrag}
        onPointerUp={endAudioDrag}
        onPointerCancel={endAudioDrag}
        onKeyDown={(event) => {
          if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            beginEditorEdit();
            const row = clamp(rowIndex + (event.key === "ArrowDown" ? 1 : -1), 0, audioRowCount - 1);
            setAudioClips((current) => current.map((item) => item.id === clip.id ? { ...item, row } : item));
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelectedAudioClipId(clip.id);
            setSelectedCaptionId(null);
            setEditorTool("audio");
            seekTimeline(clip.start);
          }
        }}
        title="Drag left or right to position · drag up or down to change rows · Alt+Arrow keys also change rows"
        className={`absolute touch-none overflow-hidden rounded-md border text-left transition-colors active:cursor-grabbing ${selected ? "cursor-grab border-primary bg-primary/25 ring-1 ring-primary" : `cursor-grab ${color.chipBorder} ${color.chipBg} hover:brightness-125`}`}
        style={{ left: `${left}%`, width: `${width}%`, top, height }}
      >
        <span className="absolute left-2 top-1 z-10 max-w-[80%] truncate rounded bg-black/60 px-1 text-[9px] font-semibold text-neutral-400">{clip.name}</span>
        <FadeWaveform peaks={waveformPeaks[clip.mediaId]} startRatio={clip.sourceStart / sourceDuration} endRatio={clip.sourceEnd / sourceDuration} className="absolute inset-x-1 top-1/2 h-[calc(100%_-_16px)] w-[calc(100%_-_8px)] -translate-y-1/2 text-[#555]" />
        {selected && <>
          <span data-audio-trim-handle role="slider" tabIndex={0} aria-label="Trim start" onPointerDown={(event) => beginAudioDrag(event, clip, "start", rowIndex)} onPointerMove={moveAudioDrag} onPointerUp={endAudioDrag} onPointerCancel={endAudioDrag} className="absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize touch-none bg-primary" />
          <span data-audio-trim-handle role="slider" tabIndex={0} aria-label="Trim end" onPointerDown={(event) => beginAudioDrag(event, clip, "end", rowIndex)} onPointerMove={moveAudioDrag} onPointerUp={endAudioDrag} onPointerCancel={endAudioDrag} className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize touch-none bg-primary" />
        </>}
      </div>;
    }
    toggleTimelinePlaybackRef.current = playTimeline;
    advancePreviewLayerRef.current = advancePreviewLayer;
    return <div className="fade-up relative mx-auto w-full max-w-6xl pb-10" onClickCapture={editGuard.guard} onPointerDownCapture={editGuard.guard} onKeyDownCapture={editGuard.guard}>
      {editGuard.dialog}
      <button type="button" onClick={() => history.back()} data-edit-guard-exempt className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-primary-deep"><Icon name="chevronLeft" size={15} /> Content Studio</button>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white"><Icon name="video" size={18} /></span>Video Editor Studio</h1><p className="mt-1 text-sm text-muted">Edit your sequence, then tailor it for every selected destination.</p></div><div className="flex items-center gap-3">{draftLocked && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-deep"><Icon name="check" size={13} /> Finished</span>}{draftStatus !== "idle" && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">{draftStatus === "saving" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/25 border-t-primary" /> : <Icon name="check" size={13} className="text-primary" />}{draftStatus === "saving" ? "Saving draft…" : "Saved as draft"}</span>}</div></div>
      <div className="card mt-5 px-6 py-5" data-edit-guard-exempt><div className="flex items-center">{FADE_WORKFLOW_STEPS.map((label, index) => <div key={label} className="flex flex-1 items-center last:flex-none"><button type="button" onClick={() => goTo(index)} className="flex min-h-11 min-w-11 flex-col items-center gap-2 rounded-lg px-1"><span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black ${index === 0 ? "border-primary bg-primary-soft text-primary-deep ring-4 ring-primary-soft/70" : "border-line bg-white text-muted"}`}>{index + 1}</span><span className={`text-xs font-black uppercase tracking-[0.12em] ${index === 0 ? "text-primary-deep" : "text-muted"}`}>{label}</span></button>{index < 2 && <span className="mx-4 mb-8 h-0.5 flex-1 bg-line sm:mx-8" />}</div>)}</div></div>
      <section className="mt-4 rounded-2xl border border-line bg-white shadow-[0_16px_42px_rgba(18,34,43,0.08)]">
        <div className="grid gap-4 border-b border-line px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"><label className="block"><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Campaign name</span><input className="input mt-2" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Name this video" /></label><div><div className="flex flex-wrap gap-2"><label className="block"><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Publish date</span><input type="date" min={earliestPublishDate} className="input mt-2" value={publishDate} onChange={(event) => updatePublishDate(event.target.value)} /></label><label className="block"><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Time</span><input type="time" min={publishDate === earliestPublishDate ? earliestPublishTime : undefined} className="input mt-2" value={publishTime} onChange={(event) => updatePublishTime(event.target.value)} /></label></div>{publishScheduleIsPastToday ? <p className="mt-2 flex items-center justify-end gap-1.5 text-xs font-semibold text-amber-700" role="alert"><Icon name="warningTriangle" size={14} />This time has already passed today. Your post will go live immediately.</p> : publishScheduleIsPast && <p className="mt-2 flex items-center justify-end gap-1.5 text-xs font-semibold text-red-700" role="alert"><Icon name="warningTriangle" size={14} />Can't schedule posts in the past.</p>}</div></div>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3"><span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Post to</span>{accounts.map((account) => <button key={account.id} type="button" aria-pressed={selectedAccountIds.has(account.id)} onClick={() => setSelectedAccountIds((current) => { const next = new Set(current); next.has(account.id) ? next.delete(account.id) : next.add(account.id); return next; })} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors ${selectedAccountIds.has(account.id) ? "border-primary bg-primary-soft text-primary-deep" : "border-line text-muted hover:border-primary/50"}`}><AccountAvatar username={account.username} platformId={account.platform} avatarUrl={account.avatar_url} selected={selectedAccountIds.has(account.id)} size={25} /><span className="max-w-24 truncate">{account.username}</span></button>)}</div>
        {segments.length === 0 && !hasAddedClip.current ? <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-deep"><Icon name="video" size={27} /></span><h2 className="mt-4 text-xl font-bold">Start your edit</h2><p className="mt-1 max-w-md text-sm text-muted">Add a video, then use the timeline to split clips and control transitions.</p><div className="mt-5 flex gap-2"><button type="button" onClick={onUpload} className="btn-primary"><Icon name="upload" size={15} /> Upload video</button><button type="button" onClick={onLibrary} className="btn-subtle">Library</button></div>{uploading && <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-deep"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />{uploadStage}</p>}</div> : <div className="bg-[#080808] text-white">
          {selectedPlatforms.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#101010] px-4 py-3"><span className="mr-1 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">Preview format</span>{selectedPlatforms.map((platformId) => { const format = fadeFormatFor(platformId, platformFormatIds); return <div key={platformId} className={`flex items-center rounded-lg border text-xs font-semibold ${currentPlatform === platformId ? "border-primary bg-primary/15 text-white" : "border-white/10 bg-white/5 text-neutral-400"}`}><button type="button" onClick={() => setActivePlatform(platformId)} className="flex items-center gap-1.5 self-stretch px-3 py-2"><PlatformIcon id={platformId} size={14} darkSurface />{platformOf(platformId)?.name ?? platformId}</button><Select value={format.id} ariaLabel={`${platformOf(platformId)?.name ?? platformId} aspect ratio`} onChange={(value) => { setPlatformFormatIds((current) => ({ ...current, [platformId]: value })); setActivePlatform(platformId); }} options={fadeFormatOptions(platformId).map((option) => ({ value: option.id, label: option.aspect.name }))} tone="dark" width={148} align="right" className="min-h-9 w-[76px] rounded-l-none border-y-0 border-r-0 border-l border-white/10 bg-transparent px-2 py-1.5 text-xs hover:bg-white/10" /></div>; })}</div>}
          <div className="relative flex min-h-[410px] items-center justify-center border-b border-white/10 bg-black px-4 py-5 sm:min-h-[500px]">
            <button type="button" onClick={onCrop} className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/15"><Icon name="expand" size={14} /> Recrop</button>
            <div ref={captionFrameRef} className="relative max-h-[450px] max-w-full overflow-hidden rounded-lg bg-neutral-950 [container-type:inline-size]" style={{ aspectRatio: `${currentAspect.width}/${currentAspect.height}`, width: `${Math.min(760, 450 * currentAspect.width / currentAspect.height)}px` }}>
              {/* Fade-through-colour transitions need something to fade *to*. */}
              {(seamPreview.backdrop || opening?.backdrop || closing?.backdrop) && <div aria-hidden="true" className="absolute inset-0" style={{ background: seamPreview.backdrop ?? opening?.backdrop ?? closing?.backdrop }} />}
	              <video
                ref={frontPreviewLayer === "a" ? previewRef : transitionPreviewRef}
                src={layerASegment ? `/api/media-file/${layerASegment.media.id}` : undefined}
                className="absolute inset-0 h-full w-full object-cover"
                style={layerAStyle}
                playsInline
                preload="auto"
                onLoadedMetadata={(event) => handleLayerLoaded(event, frontPreviewLayer === "a", layerASegment)}
                onTimeUpdate={handlePreviewTimeUpdate}
                onEnded={() => { if (frontPreviewLayer === "a") advancePreviewLayer(); }}
              />
              <video
                ref={frontPreviewLayer === "b" ? previewRef : transitionPreviewRef}
                src={layerBSegment ? `/api/media-file/${layerBSegment.media.id}` : undefined}
                className="absolute inset-0 h-full w-full object-cover"
                style={layerBStyle}
                playsInline
                preload="auto"
                onLoadedMetadata={(event) => handleLayerLoaded(event, frontPreviewLayer === "b", layerBSegment)}
                onTimeUpdate={handlePreviewTimeUpdate}
	                onEnded={() => { if (frontPreviewLayer === "b") advancePreviewLayer(); }}
	              />
	              {previewInGap && <div className="absolute inset-0 z-[4] bg-black" aria-label="Blank timeline gap" />}
	              {captionLayers.filter((layer) => previewTime >= layer.start && previewTime <= layer.end).map((layer) => (
                <FadeCaptionLayerView
                  key={layer.id}
                  layer={layer}
                  selected={editorTool === "captions" && selectedCaptionId === layer.id}
                  frameRef={captionFrameRef}
                  onSelect={() => { setSelectedCaptionId(layer.id); setSelectedAudioClipId(null); setEditorTool("captions"); }}
                  onChange={(patch) => setCaptionLayers((current) => current.map((l) => (l.id === layer.id ? { ...l, ...patch } : l)))}
                  onDelete={() => { setCaptionLayers((current) => current.filter((l) => l.id !== layer.id)); setSelectedCaptionId(null); }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-1">
              <button type="button" onClick={undo} disabled={!canUndo} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30" aria-label="Undo last edit" title="Undo (Ctrl+Z / ⌘Z)"><Icon name="undo" size={18} /></button>
              <button type="button" onClick={redo} disabled={!canRedo} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30" aria-label="Redo last edit" title="Redo (Ctrl+Y / ⌘⇧Z)"><Icon name="redo" size={18} /></button>
            </div>
            <div className="flex items-center gap-3 justify-self-center"><button type="button" data-edit-guard-exempt onClick={playTimeline} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-sm hover:bg-neutral-200" aria-label={timelinePlaying ? "Pause timeline" : "Play timeline"}><Icon name={timelinePlaying ? "pause" : "play"} size={16} /></button><span className="min-w-32 font-mono text-sm text-neutral-300">{formatFadeTime(previewTime, true)} / {formatFadeTime(timelineDuration, true)}</span></div>
            <div className="flex items-center gap-1 justify-self-end"><span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">Zoom {Math.round(timelineZoom * 100)}%</span><button type="button" onClick={() => setTimelineZoom((current) => clampTimelineZoom(current - TIMELINE_ZOOM_STEP))} disabled={timelineZoom <= TIMELINE_ZOOM_MIN} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-neutral-300 hover:bg-white/10 disabled:opacity-30" aria-label="Zoom timeline out">−</button><button type="button" onClick={() => setTimelineZoom((current) => clampTimelineZoom(current + TIMELINE_ZOOM_STEP))} disabled={timelineZoom >= TIMELINE_ZOOM_MAX} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10 disabled:opacity-30" aria-label="Zoom timeline in"><Icon name="plus" size={14} /></button></div>
          </div>
          <div className="border-b border-white/10 bg-[#0b0b0b] px-4 py-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-neutral-400">
              <div className="flex items-center gap-1">
                <span>Timeline</span>
                <div className="group relative ml-1 flex">
                  <button
                    type="button"
                    onClick={() => setSnappingEnabled((current) => !current)}
                    aria-pressed={snappingEnabled}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${snappingEnabled ? "bg-primary/20 text-primary-deep" : "text-neutral-500 hover:bg-white/10 hover:text-white"}`}
                  >
                    <Icon name="download" size={14} className="rotate-90" />
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#161616] px-2 py-1 text-[11px] font-semibold text-neutral-200 opacity-0 shadow-xl transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    Snap to
                  </span>
                </div>
                <FadeHotkeysTooltip />
              </div>
              <span>{formatFadeTime(timelineDuration)} total · {segments.length}/{MAX_FADE_SEGMENTS} clips</span>
            </div>
            <div ref={timelineViewportRef} className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black [scrollbar-color:#3f3f46_#111]">
              <div className="flex">
                {/* Row-type gutter — purely a visual aid to tell rows apart at
                    a glance, so it mirrors the content column's row heights
                    exactly but carries no interaction of its own. */}
                <div className="sticky left-0 z-40 flex w-7 shrink-0 flex-col bg-[#0d0d0d] text-neutral-600">
                  <div className="h-10 shrink-0" />
                  <div className="flex h-[74px] shrink-0 items-center justify-center border-t border-white/5" title="Video"><Icon name="video" size={13} /></div>
                  <div className="flex h-7 shrink-0 items-center justify-center border-t border-white/5" title="Clip audio (attached)"><Icon name="audio" size={10} /></div>
                  <div className="h-12 shrink-0 border-t border-white/5" />
                  {Array.from({ length: audioRowCount }, (_, rowIndex) => (
                    <div key={`gutter-audio-${rowIndex}`} className="flex h-10 shrink-0 items-center justify-center gap-0.5 border-t border-white/5" title={`Audio row ${rowIndex + 1}`}>
                      <Icon name="audio" size={11} />
                      <span className="font-mono text-[9px]">{rowIndex + 1}</span>
                    </div>
                  ))}
                  <div className="h-12 shrink-0 border-t border-white/5" />
                  {Array.from({ length: captionRowCount }, (_, rowIndex) => (
                    <div key={`gutter-caption-${rowIndex}`} className="flex h-10 shrink-0 items-center justify-center gap-0.5 border-t border-white/5" title={`Text row ${rowIndex + 1}`}>
                      <Icon name="type" size={11} />
                      <span className="font-mono text-[9px]">{rowIndex + 1}</span>
                    </div>
                  ))}
                  <div className="h-12 shrink-0 border-t border-white/5" />
                </div>
	              <div ref={timelineCanvasRef} onPointerMove={moveCaptionDrag} onPointerUp={endCaptionDrag} onPointerCancel={endCaptionDrag} className="relative min-h-[194px] shrink-0 select-none" style={{ width: `${Math.max(TIMELINE_MIN_WIDTH_PX, timelineDuration * TIMELINE_PIXELS_PER_SECOND * timelineZoom)}px` }}>
                <button type="button" data-keep-selection className="relative block h-10 w-full cursor-crosshair border-b border-white/10 bg-[#101010] text-left" aria-label="Seek timeline" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekFromTimelinePointer(event.clientX); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromTimelinePointer(event.clientX); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}>
                  {fadeTimelineTicks(timelineDuration).map((tick) => (
                    <span
                      key={tick}
                      className="absolute inset-y-0 border-l border-white/15"
                      style={{ left: `${(tick / timelineDuration) * 100}%` }}
                    >
                      <span
                        className={
                          compactTimelineRuler
                            ? `absolute top-1/2 whitespace-nowrap font-mono text-[10px] text-neutral-500 ${
                                tick === 0
                                  ? "left-1.5 -translate-y-1/2 -rotate-90"
                                  : tick === timelineDuration
                                    ? "right-1.5 -translate-y-1/2 -rotate-90"
                                    : "left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
                              }`
                            : "absolute left-1.5 top-2 whitespace-nowrap font-mono text-[10px] text-neutral-500"
                        }
                      >
                        {formatFadeTime(tick)}
                      </span>
                    </span>
                  ))}
                </button>
                <div className="relative h-[74px] border-b border-white/10 bg-[#0d0d0d]" aria-label="Video track">
                  {segments.map((segment, index) => {
                    const gap = Math.max(0, segment.gapBefore ?? 0);
                    if (gap <= 0) return null;
                    const offset = segmentOffsets[index];
                    return <div
                      key={`gap-${segment.id}`}
                      className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-md border border-dashed border-white/15 bg-black text-[9px] font-semibold text-neutral-500"
                      style={{ left: `${((offset - gap) / timelineDuration) * 100}%`, width: `${(gap / timelineDuration) * 100}%` }}
                      title={`Blank gap · ${formatFadeTime(gap, true)}`}
                    >
                      <span className="truncate px-1">Blank · {formatFadeTime(gap, true)}</span>
                    </div>;
                  })}
                  {segments.map((segment, index) => {
                    const segmentDuration = fadeSegmentDuration(segment);
                    const segmentOffset = segmentOffsets[index];
                    const selected = activeSegment?.id === segment.id && ["clip", "trim"].includes(editorTool);
                    const sourceDuration = Math.max(0.1, segment.duration ?? segment.end ?? 0.1);
                    // Square tiles at a fixed pitch, each showing the frame at
                    // that tile's own point in the *trimmed* window — so
                    // trimming changes which frames are on screen.
                    const stripFrames = filmstrips[segment.media.id] ?? 0;
                    const clipPixels = (segmentDuration / timelineDuration) * timelineCanvasWidth;
                    const tileCount = Math.max(1, Math.min(80, Math.ceil(clipPixels / FILMSTRIP_TILE_PX)));
                    const segmentEnd = segment.end ?? sourceDuration;
                    const clipColor = fadeAccentColor(index);
                    return <div key={segment.id} role="button" tabIndex={0} aria-label={`Clip ${index + 1}, ${formatFadeTime(segmentDuration, true)}${(segment.gapBefore ?? 0) > 0 ? `, preceded by ${formatFadeTime(segment.gapBefore ?? 0, true)} of blank space` : ""}`}
                      onPointerDown={(event) => beginClipPositionDrag(event, segment)}
                      onPointerMove={moveClipPositionDrag}
                      onPointerUp={endClipPositionDrag}
                      onPointerCancel={endClipPositionDrag}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); seekTimeline(segmentOffset); setActiveSegmentId(segment.id); setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("clip"); } }}
                      onDragOver={(event) => { if (!transitionDragged(event) && !clipDragged(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = clipDragged(event) ? "move" : "copy"; if (clipDragged(event)) setClipDropTarget(index); else setSeamDropTarget(nearestSeam(event, index)); }}
                      onDragLeave={() => { setClipDropTarget(null); setSeamDropTarget(null); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setClipDropTarget(null);
                        setSeamDropTarget(null);
                        const clipFrom = event.dataTransfer.getData(CLIP_DND_TYPE);
                        if (clipFrom) { moveSegment(Number(clipFrom), index); return; }
                        const id = event.dataTransfer.getData(TRANSITION_DND_TYPE);
                        // Dropping on a clip's leading half sets the seam before
                        // it; the trailing half sets the seam after it.
                        if (id) applySeamTransition(nearestSeam(event, index), id);
                      }}
                      // No z-index here: giving the whole clip a stacking
                      // context would trap its trim handles inside it, so a
                      // transition marker (z-20, a later sibling) would win
                      // against the *entire* clip rather than just the parts
                      // that should stay on top of it. Leaving this at the
                      // ambient level lets the handles' own z-30 (below) win
                      // individually, while the seam still reads above the
                      // rest of the clip body as intended.
                      className={`absolute inset-y-1 touch-none overflow-hidden rounded-md border text-left transition-colors ${clipDropTarget === index ? "border-sky-400 ring-2 ring-sky-400" : selected ? "cursor-grab border-primary ring-1 ring-primary active:cursor-grabbing" : `cursor-grab ${clipColor.border} hover:brightness-125 active:cursor-grabbing`}`}
                      style={{ left: `${(segmentOffset / timelineDuration) * 100}%`, width: `${(segmentDuration / timelineDuration) * 100}%`, background: index % 2 === 0 ? "linear-gradient(135deg,#262626,#171717)" : "linear-gradient(135deg,#202020,#111)" }}
                    >
                      {stripFrames > 0 && <span aria-hidden="true" className="absolute inset-0 flex overflow-hidden">{Array.from({ length: tileCount }, (_, tile) => {
                        // Source time at this tile's centre, then which sprite
                        // frame covers it.
                        const sourceTime = segment.start + ((tile + 0.5) / tileCount) * (segmentEnd - segment.start);
                        const frame = Math.min(stripFrames - 1, Math.max(0, Math.floor((sourceTime / sourceDuration) * stripFrames)));
                        return <span key={tile} className="h-full shrink-0 border-r border-black/30 last:border-r-0" style={{ width: FILMSTRIP_TILE_PX, ...filmstripTileStyle(segment.media.id, frame, stripFrames) }} />;
                      })}</span>}
                      <span
                        data-clip-reorder
                        draggable
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          // stopPropagation on pointerdown keeps this strip's
                          // native drag-to-reorder from also triggering the
                          // clip body's own pointer-drag (gap adjustment) —
                          // but that means a plain click here never reaches
                          // beginClipPositionDrag either, so it needs its own
                          // selection logic. A real drag suppresses the
                          // browser's synthetic click, so this only ever
                          // fires for an actual click, never a reorder drag.
                          seekFromTimelinePointer(event.clientX);
                          setActiveSegmentId(segment.id);
                          setSelectedCaptionId(null);
                          setSelectedAudioClipId(null);
                          setEditorTool("clip");
                        }}
                        onDragStart={(event) => { event.dataTransfer.setData(CLIP_DND_TYPE, String(index)); event.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => setClipDropTarget(null)}
                        title="Drag to reorder"
                        className={`absolute inset-x-0 bottom-0 flex cursor-grab items-center gap-1 ${clipColor.labelBg} px-2 py-1 active:cursor-grabbing`}
                      >
                        <Icon name="dots" size={11} className="shrink-0 text-neutral-500" />
                        <span className="min-w-0"><span className="block truncate text-[11px] font-bold text-white">Clip {index + 1} · {formatFadeTime(segmentDuration, true)}</span><span className="block truncate text-[9px] text-neutral-400">{segment.media.name}</span></span>
                      </span>
                      {selected && <><span data-trim-handle role="slider" tabIndex={0} aria-label={`Trim start of clip ${index + 1}`} aria-valuemin={0} aria-valuemax={segment.end ?? segment.duration ?? 0} aria-valuenow={segment.start} onPointerDown={(event) => beginTimelineTrim(event, segment, "start", segmentOffset)} onPointerMove={moveTimelineTrim} onPointerUp={endTimelineTrim} onPointerCancel={endTimelineTrim} className="absolute inset-y-0 left-0 z-30 w-2 cursor-ew-resize touch-none bg-primary before:absolute before:left-1/2 before:top-1/2 before:h-5 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-white/80" /><span data-trim-handle role="slider" tabIndex={0} aria-label={`Trim end of clip ${index + 1}`} aria-valuemin={segment.start} aria-valuemax={segment.duration ?? segment.end ?? 0} aria-valuenow={segment.end ?? segment.duration ?? 0} onPointerDown={(event) => beginTimelineTrim(event, segment, "end", segmentOffset)} onPointerMove={moveTimelineTrim} onPointerUp={endTimelineTrim} onPointerCancel={endTimelineTrim} className="absolute inset-y-0 right-0 z-30 w-2 cursor-ew-resize touch-none bg-primary before:absolute before:left-1/2 before:top-1/2 before:h-5 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-white/80" /></>}
                    </div>;
                  })}
                  {(() => {
                    const seam = getSeam(0);
                    const isCut = seam.type === "cut";
                    const isTarget = seamDropTarget === 0;
                    return <button key="seam-open" type="button"
                      aria-label={`Opening: fade in from black, ${transitionLabel(seam.type)}`}
                      onClick={() => { setSelectedSeam(0); setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("transition"); }}
                      onPointerDown={(event) => beginSeamDrag(event, 0)}
                      onPointerMove={moveSeamDrag}
                      onPointerUp={endSeamDrag}
                      onPointerCancel={endSeamDrag}
                      onDragOver={(event) => { if (!transitionDragged(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setSeamDropTarget(0); }}
                      onDragLeave={() => setSeamDropTarget(null)}
                      onDrop={(event) => { event.preventDefault(); setSeamDropTarget(null); const id = event.dataTransfer.getData(TRANSITION_DND_TYPE); if (id) applySeamTransition(0, id); }}
                      className={`absolute inset-y-1 left-0 z-20 flex touch-none items-center justify-center overflow-hidden rounded-lg border text-white shadow-[0_2px_10px_rgba(0,0,0,0.55)] ${isTarget ? "border-sky-200 bg-sky-400" : isCut ? "border-white/20 bg-neutral-700/90 hover:bg-neutral-600" : "border-sky-300/40 bg-sky-500 hover:bg-sky-400"} ${selectedSeam === 0 ? "ring-2 ring-white" : ""} ${isCut ? "cursor-pointer" : "cursor-ew-resize"}`}
                      style={{ width: `${(seam.duration / timelineDuration) * 100}%`, minWidth: isCut ? 12 : 30 }}
                      title={isCut ? "Fade in from black — drop a transition here" : `Fade in from black · ${transitionLabel(seam.type)} · ${seam.duration.toFixed(1)}s · drag right to lengthen`}
                    >
                      <Icon name={isCut ? "scissors" : "chevronsUpDown"} size={13} className={isCut ? "" : "rotate-90"} />
                    </button>;
                  })()}
                  {segments.slice(1).map((segment, index) => {
                    const seatIndex = index + 1;
                    const offset = segmentOffsets[seatIndex];
                    const seam = segmentSeam(segment);
                    const isCut = seam.type === "cut";
                    const isTarget = seamDropTarget === seatIndex;
                    // The block covers the real overlap window, so its width is
                    // the transition's length — widen it by dragging an edge.
                    const overlap = transitionOverlaps[seatIndex] ?? 0;
                    return <button key={`seam-${segment.id}`} type="button"
                      aria-label={`Transition between clip ${index + 1} and clip ${index + 2}: ${transitionLabel(seam.type)}`}
                      onClick={() => { setSelectedSeam(seatIndex); setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("transition"); }}
                      onPointerDown={(event) => beginSeamDrag(event, seatIndex)}
                      onPointerMove={moveSeamDrag}
                      onPointerUp={endSeamDrag}
                      onPointerCancel={endSeamDrag}
                      onDragOver={(event) => { if (!transitionDragged(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setSeamDropTarget(seatIndex); }}
                      onDragLeave={() => setSeamDropTarget(null)}
                      onDrop={(event) => { event.preventDefault(); setSeamDropTarget(null); const id = event.dataTransfer.getData(TRANSITION_DND_TYPE); if (id) applySeamTransition(seatIndex, id); }}
                      className={`absolute inset-y-1 z-20 flex touch-none items-center justify-center overflow-hidden rounded-lg border text-white shadow-[0_2px_10px_rgba(0,0,0,0.55)] ${isTarget ? "border-sky-200 bg-sky-400" : isCut ? "border-white/20 bg-neutral-700/90 hover:bg-neutral-600" : "border-sky-300/40 bg-sky-500 hover:bg-sky-400"} ${selectedSeam === seatIndex ? "ring-2 ring-white" : ""} ${isCut ? "cursor-pointer" : "cursor-ew-resize"}`}
                      style={{ left: `${(offset / timelineDuration) * 100}%`, width: `${(overlap / timelineDuration) * 100}%`, minWidth: isCut ? 6 : 30, transform: isCut ? "translateX(-50%)" : undefined }}
                      title={isCut ? "Hard cut — drop a transition here" : `${transitionLabel(seam.type)} · ${seam.duration.toFixed(1)}s · drag left to lengthen, right to shorten`}
                    >
                      <Icon name={isCut ? "scissors" : "chevronsUpDown"} size={13} className={isCut ? "" : "rotate-90"} />
                    </button>;
                  })}
                  {(() => {
                    const seam = closingSeam;
                    const isCut = seam.type === "cut";
                    const isTarget = seamDropTarget === segments.length;
                    return <button key="seam-close" type="button"
                      aria-label={`Closing: fade out to black, ${transitionLabel(seam.type)}`}
                      onClick={() => { setSelectedSeam(segments.length); setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("transition"); }}
                      onPointerDown={(event) => beginSeamDrag(event, segments.length)}
                      onPointerMove={moveSeamDrag}
                      onPointerUp={endSeamDrag}
                      onPointerCancel={endSeamDrag}
                      onDragOver={(event) => { if (!transitionDragged(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setSeamDropTarget(segments.length); }}
                      onDragLeave={() => setSeamDropTarget(null)}
                      onDrop={(event) => { event.preventDefault(); setSeamDropTarget(null); const id = event.dataTransfer.getData(TRANSITION_DND_TYPE); if (id) applySeamTransition(segments.length, id); }}
                      className={`absolute inset-y-1 right-0 z-20 flex touch-none items-center justify-center overflow-hidden rounded-lg border text-white shadow-[0_2px_10px_rgba(0,0,0,0.55)] ${isTarget ? "border-sky-200 bg-sky-400" : isCut ? "border-white/20 bg-neutral-700/90 hover:bg-neutral-600" : "border-sky-300/40 bg-sky-500 hover:bg-sky-400"} ${selectedSeam === segments.length ? "ring-2 ring-white" : ""} ${isCut ? "cursor-pointer" : "cursor-ew-resize"}`}
                      style={{ width: `${(seam.duration / timelineDuration) * 100}%`, minWidth: isCut ? 12 : 30 }}
                      title={isCut ? "Fade out to black — drop a transition here" : `Fade out to black · ${transitionLabel(seam.type)} · ${seam.duration.toFixed(1)}s · drag left to lengthen`}
                    >
                      <Icon name={isCut ? "scissors" : "chevronsUpDown"} size={13} className={isCut ? "" : "rotate-90"} />
                    </button>;
                  })()}
                </div>
                <div className="relative h-7 border-b border-white/10 bg-[#0a0a0a]" aria-label="Original clip audio track (attached, shorter than a full audio row)">
                  {segments.map((segment, index) => {
                    // Detaching or deleting sets audioRemoved, so this row stays
                    // gone even after the detached clip it moved into is itself
                    // deleted — it used to reappear (looking re-attached) the
                    // moment that clip went away. The second check now only
                    // covers drafts saved before that fix.
                    if (segment.audioRemoved) return null;
                    if (audioClips.some((clip) => clip.kind === "detached" && clip.sourceSegmentId === segment.id)) return null;
                    const segmentDuration = fadeSegmentDuration(segment);
                    const segmentOffset = segmentOffsets[index];
                    const sourceDuration = Math.max(0.1, segment.duration ?? segment.end ?? 0.1);
                    // Selected here means "click to inspect/adjust volume" (unchanged,
                    // no gate) — the trim handles that appear once selected are the
                    // new gesture here, and they open the detach
                    // confirmation, since dragging/trimming/deleting audio that's
                    // still glued to its video doesn't make sense without detaching first.
                    const selected = activeSegment?.id === segment.id && editorTool === "volume";
                    const clipColor = fadeAccentColor(index);
                    return <div key={`audio-${segment.id}`} role="button" tabIndex={0}
                      onPointerDown={(event) => { if ((event.target as HTMLElement).closest("[data-audio-trim-handle]")) return; seekFromTimelinePointer(event.clientX); setActiveSegmentId(segment.id); setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("volume"); }}
                      className={`absolute inset-y-0.5 overflow-hidden rounded border text-left ${selected ? `${clipColor.chipBg} border-white/40` : `${clipColor.chipBg} ${clipColor.chipBorder} hover:brightness-125`}`}
                      style={{ left: `${(segmentOffset / timelineDuration) * 100}%`, width: `${(segmentDuration / timelineDuration) * 100}%` }}
                      title={`Clip ${index + 1} audio at ${Math.round((segment.volume ?? 1) * 100)}%`}
                    >
                      <FadeWaveform peaks={waveformPeaks[segment.media.id]} startRatio={segment.start / sourceDuration} endRatio={(segment.end ?? sourceDuration) / sourceDuration} className="absolute inset-1 h-[calc(100%_-_8px)] w-[calc(100%_-_8px)] text-[#656565]" />
                      {selected && <>
                        <span data-audio-trim-handle role="slider" tabIndex={0} aria-label="Trim clip audio start (detaches it from the video)" onPointerDown={(event) => { event.stopPropagation(); requestDetach(segment); }} className="absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize touch-none bg-primary/70" />
                        <span data-audio-trim-handle role="slider" tabIndex={0} aria-label="Trim clip audio end (detaches it from the video)" onPointerDown={(event) => { event.stopPropagation(); requestDetach(segment); }} className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize touch-none bg-primary/70" />
                      </>}
                    </div>;
                  })}
                </div>
                <div className="relative flex h-12 items-center border-b border-white/10 bg-[#0a0a0a]">
                  <button
                    type="button"
                    onClick={onUpload}
                    disabled={segments.length >= MAX_FADE_SEGMENTS}
                    className="sticky left-8 flex min-h-10 items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                    style={{ width: fixedLaneControlWidth }}
                  >
                    <Icon name="plus" size={12} /> Add Clip
                  </button>
                </div>
                {(audioClips.length > 0 || audioExtraRows > 0) && <div
                  ref={audioLaneRef}
                  className="relative border-b border-white/10 bg-[#0a0a0a]"
                  style={{ height: audioRowCount * FADE_AUDIO_ROW_HEIGHT }}
                  aria-label="Audio clips tracks"
                >
                  {Array.from({ length: audioRowCount }, (_, rowIndex) => {
                    const rowEmpty = (audioRows[rowIndex]?.length ?? 0) === 0;
                    return <div
                      key={`audio-row-${rowIndex}`}
                      className={`pointer-events-none absolute inset-x-0 flex items-center border-t border-white/[0.06] transition-colors first:border-t-0 ${audioRowDropTarget === rowIndex ? "bg-primary/10 ring-1 ring-inset ring-primary/50" : ""}`}
                      style={{ top: rowIndex * FADE_AUDIO_ROW_HEIGHT, height: FADE_AUDIO_ROW_HEIGHT }}
                    >
                      {rowEmpty && <button
                        type="button"
                        onClick={() => deleteAudioRow(rowIndex)}
                        aria-label={`Delete empty row ${rowIndex + 1}`}
                        title="Delete this empty row"
                        className="sticky left-8 z-10 flex items-center gap-1 rounded-lg border border-dashed border-red-400/30 bg-red-400/5 px-2.5 py-1 pointer-events-auto text-[11px] font-semibold text-red-300 transition-colors hover:border-red-300/60 hover:bg-red-400/15 hover:text-red-200"
                      >
                        <span aria-hidden="true">−</span> Delete Row
                      </button>}
                    </div>;
                  })}
                  {audioRows.map((row, rowIndex) => row.map((clip) =>
                    renderAudioBlock(
                      clip,
                      rowIndex * FADE_AUDIO_ROW_HEIGHT + 4,
                      FADE_AUDIO_ROW_HEIGHT - 8,
                      rowIndex,
                    ),
                  ))}
                </div>}
                <div className="relative flex h-12 items-center border-t border-white/10 bg-[#0a0a0a]">
                  <div className="sticky left-8 flex items-center gap-2" style={{ width: fixedLaneControlWidth }}>
                    <button
                      type="button"
                      onClick={() => setAudioExtraRows((current) => current + 1)}
                      title="Reserve an empty row to drag audio clips into"
                      className="flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 px-3 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Icon name="plus" size={12} /> Add Row
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("audio"); }}
                      className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Icon name="plus" size={12} /> Add Audio Clip
                    </button>
                  </div>
                </div>
                {(captionLayers.length > 0 || captionExtraRows > 0) && <div
                  ref={captionLaneRef}
                  className="relative border-t border-white/10 bg-[#0a0a0a]"
                  style={{ height: captionRowCount * FADE_CAPTION_ROW_HEIGHT }}
                  aria-label="Text overlays track"
                >
                  {Array.from({ length: captionRowCount }, (_, rowIndex) => {
                    const rowEmpty = (captionRows[rowIndex]?.length ?? 0) === 0;
                    return <div
                      key={`caption-row-${rowIndex}`}
                      className={`pointer-events-none absolute inset-x-0 flex items-center border-t border-white/[0.06] transition-colors first:border-t-0 ${captionRowDropTarget === rowIndex ? "bg-primary/10 ring-1 ring-inset ring-primary/50" : ""}`}
                      style={{ top: rowIndex * FADE_CAPTION_ROW_HEIGHT, height: FADE_CAPTION_ROW_HEIGHT }}
                    >
                      {rowEmpty && <button
                        type="button"
                        onClick={() => deleteCaptionRow(rowIndex)}
                        aria-label={`Delete empty row ${rowIndex + 1}`}
                        title="Delete this empty row"
                        className="sticky left-8 z-10 flex items-center gap-1 rounded-lg border border-dashed border-red-400/30 bg-red-400/5 px-2.5 py-1 pointer-events-auto text-[11px] font-semibold text-red-300 transition-colors hover:border-red-300/60 hover:bg-red-400/15 hover:text-red-200"
                      >
                        <span aria-hidden="true">−</span> Delete Row
                      </button>}
                    </div>;
                  })}
                  {captionRows.map((row, rowIndex) => row.map((layer) => {
                    const left = (layer.start / timelineDuration) * 100;
                    const width = ((layer.end - layer.start) / timelineDuration) * 100;
                    const selected = editorTool === "captions" && selectedCaptionId === layer.id;
                    const color = fadeAccentColor(captionLayers.findIndex((item) => item.id === layer.id));
                    return <div key={layer.id} role="button" tabIndex={0}
                      data-keep-selection
                      aria-label={`Text overlay "${layer.text.trim() || "empty"}", ${formatFadeTime(layer.end - layer.start, true)}`}
                      onPointerDown={(event) => {
                        if ((event.target as HTMLElement).closest("[data-caption-trim-handle]")) return;
                        beginCaptionDrag(event, layer, "move", rowIndex);
                      }}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedCaptionId(layer.id); setSelectedAudioClipId(null); setEditorTool("captions"); seekTimeline(layer.start); } }}
                      className={`absolute touch-none overflow-hidden rounded-md border text-left transition-colors ${selected ? "border-primary bg-primary/25 ring-1 ring-primary" : `${color.chipBorder} ${color.chipBg} hover:brightness-125`}`}
                      style={{ left: `${left}%`, width: `${width}%`, top: rowIndex * FADE_CAPTION_ROW_HEIGHT + 4, height: FADE_CAPTION_ROW_HEIGHT - 8 }}
                    >
                      <span className={`block truncate py-2.5 text-[10px] font-bold text-white ${selected ? "px-5" : "px-2"}`}>{layer.text.trim() || "Text overlay"}</span>
                      {selected && <>
                        <span data-caption-trim-handle role="slider" tabIndex={0} aria-orientation="horizontal" aria-label="Trim text overlay start" aria-valuemin={0} aria-valuemax={layer.end} aria-valuenow={layer.start} title="Drag to trim the text overlay start" onPointerDown={(event) => beginCaptionDrag(event, layer, "start", rowIndex)} className="absolute inset-y-0 left-0 z-20 w-4 cursor-ew-resize touch-none bg-primary/90 before:absolute before:left-1/2 before:top-1/2 before:h-4 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-white/90" />
                        <span data-caption-trim-handle role="slider" tabIndex={0} aria-orientation="horizontal" aria-label="Trim text overlay end" aria-valuemin={layer.start} aria-valuemax={timelineDuration} aria-valuenow={layer.end} title="Drag to trim the text overlay end" onPointerDown={(event) => beginCaptionDrag(event, layer, "end", rowIndex)} className="absolute inset-y-0 right-0 z-20 w-4 cursor-ew-resize touch-none bg-primary/90 before:absolute before:left-1/2 before:top-1/2 before:h-4 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-white/90" />
                      </>}
                    </div>;
                  }))}
                </div>}
                <div className="relative flex h-12 items-center border-t border-white/10 bg-[#0a0a0a]">
                  <div className="sticky left-8 flex items-center gap-2" style={{ width: fixedLaneControlWidth }}>
                    <button
                      type="button"
                      onClick={() => setCaptionExtraRows((current) => current + 1)}
                      title="Reserve an empty row to drag text overlays into"
                      className="flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 px-3 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Icon name="plus" size={12} /> Add Row
                    </button>
                    <button
                      type="button"
                      onClick={addCaptionLayer}
                      className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Icon name="plus" size={12} /> Add Text Overlay
                    </button>
                  </div>
                </div>
                {snapIndicator !== null && <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 z-40 w-0.5 bg-primary shadow-[0_0_8px_rgba(45,212,191,0.9)]"
                  style={{ left: `${Math.min(100, Math.max(0, (snapIndicator / timelineDuration) * 100))}%` }}
                />}
                <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ left: `${Math.min(100, Math.max(0, (previewTime / timelineDuration) * 100))}%` }}><span className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 rounded-[2px] bg-white" /><span className="absolute left-2 top-1 rounded bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-black shadow">{formatFadeTime(previewTime, true)}</span></div>
              </div>
              </div>
            </div>
          </div>
          <div className="min-h-24 border-b border-white/10 px-4 py-4">
            {editorTool === "clip" && activeSegment && (
              <section aria-labelledby="clip-settings-heading">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon name="video" size={15} className="shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                      <h3 id="clip-settings-heading" className="text-sm font-bold text-white">
                        Clip Settings
                      </h3>
                      <p className="max-w-80 truncate text-xs text-neutral-500">
                        {activeSegment.media.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeActive}
                    aria-label={`Delete clip ${activeSegment.media.name}`}
                    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 text-xs font-bold text-red-200 transition-colors hover:border-red-300/40 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    <Icon name="trash" size={14} />
                    Delete
                  </button>
                </div>
                <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500">In</dt>
                    <dd className="mt-0.5 font-mono text-neutral-200">
                      {activeSegment.start.toFixed(1)}s
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500">Out</dt>
                    <dd className="mt-0.5 font-mono text-neutral-200">
                      {(activeSegment.end ?? activeSegment.duration ?? 0).toFixed(1)}s
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500">Timeline position</dt>
                    <dd className="mt-0.5 font-mono text-neutral-200">
                      {previewTime.toFixed(1)}s
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-neutral-500">Blank before</dt>
                    <dd className="mt-0.5 font-mono text-neutral-200">{(activeSegment.gapBefore ?? 0).toFixed(1)}s</dd>
                  </div>
                </dl>
                <label className="mt-4 block max-w-xl text-xs font-semibold text-neutral-300">
                  Gap before clip · {(activeSegment.gapBefore ?? 0).toFixed(1)}s
                  <input type="range" min="0" max="60" step="0.05" value={activeSegment.gapBefore ?? 0} onPointerDown={beginEditorEdit} onChange={(event) => setSegmentGap(activeSegment.id, Number(event.target.value))} className="mt-3 w-full accent-primary" />
                  <span className="mt-1.5 block font-normal text-neutral-500">Drag the clip left or right on the timeline, or use this control for precise blank space.</span>
                </label>
              </section>
            )}
            {editorTool === "trim" && activeSegment && <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-semibold text-neutral-300"><span className="flex items-center justify-between"><span>Trim start</span><span className="font-mono text-neutral-400">{activeSegment.start.toFixed(1)}s</span></span><input type="range" min="0" max={Math.max(0.1, (activeSegment.end ?? activeSegment.duration ?? 0) - 0.1)} step="0.1" value={activeSegment.start} onPointerDown={beginEditorEdit} onChange={(event) => { const end = activeSegment.end ?? activeSegment.duration ?? 0; const start = Math.min(end - 0.1, Number(event.target.value)); setActiveTrim(start, end); setSplitAt(start); setPreviewTime(activeOffset); if (previewRef.current) previewRef.current.currentTime = start; }} className="mt-3 w-full accent-primary" /></label><label className="text-xs font-semibold text-neutral-300"><span className="flex items-center justify-between"><span>Trim end</span><span className="font-mono text-neutral-400">{(activeSegment.end ?? activeSegment.duration ?? 0).toFixed(1)}s</span></span><input type="range" min={activeSegment.start + 0.1} max={Math.max(activeSegment.start + 0.1, activeSegment.duration ?? activeSegment.end ?? 0)} step="0.1" value={activeSegment.end ?? activeSegment.duration ?? 0} onPointerDown={beginEditorEdit} onChange={(event) => { const end = Math.max(activeSegment.start + 0.1, Number(event.target.value)); const sourceTime = Math.min(splitAt, end); setActiveTrim(activeSegment.start, end); setSplitAt(sourceTime); setPreviewTime(activeOffset + sourceTime - activeSegment.start); if (previewRef.current) previewRef.current.currentTime = sourceTime; }} className="mt-3 w-full accent-primary" /></label></div>}
            {editorTool === "transition" && <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div className="text-xs font-semibold text-neutral-300">
                  <span className="block text-neutral-500">Editing seam</span>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button type="button" onClick={() => setSelectedSeam(0)} className={`min-h-8 rounded-md border px-2 text-[11px] font-bold ${seamIndex === 0 ? "border-primary bg-primary/20 text-white" : "border-white/15 text-neutral-300 hover:border-white/35"}`}>Open</button>
                    {hasSeams && segments.slice(1).map((segment, index) => <button key={`seam-pick-${segment.id}`} type="button" onClick={() => setSelectedSeam(index + 1)} className={`min-h-8 rounded-md border px-2 text-[11px] font-bold ${seamIndex === index + 1 ? "border-primary bg-primary/20 text-white" : "border-white/15 text-neutral-300 hover:border-white/35"}`}>{index + 1}→{index + 2}</button>)}
                    <button type="button" onClick={() => setSelectedSeam(segments.length)} className={`min-h-8 rounded-md border px-2 text-[11px] font-bold ${seamIndex === segments.length ? "border-primary bg-primary/20 text-white" : "border-white/15 text-neutral-300 hover:border-white/35"}`}>Close</button>
                  </div>
                </div>
                <label className="min-w-40 flex-1 text-xs font-semibold text-neutral-300">
                  Length · {activeSeam.type === "cut" ? "Instant" : `${activeSeam.duration.toFixed(1)}s`}
                  <input type="range" min={TRANSITION_DURATION_MIN} max={TRANSITION_DURATION_MAX} step="0.1" disabled={activeSeam.type === "cut"} value={activeSeam.duration} onPointerDown={beginEditorEdit} onChange={(event) => setSegmentSeam(seamIndex, { type: activeSeam.type, duration: clampTransitionDuration(event.target.value) })} className="mt-2 w-full accent-primary disabled:opacity-30" />
                </label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => previewFrom(seamPreviewSeekPosition(seamIndex))} disabled={activeSeam.type === "cut"} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-35"><Icon name="play" size={12} /> Preview</button>
                  <button type="button" onClick={() => { beginEditorEdit(); setSegmentSeam(seamIndex, { type: "cut", duration: transitionDuration }); }} disabled={activeSeam.type === "cut"} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-200 transition-colors hover:border-red-300/40 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-35" aria-label="Delete this transition"><Icon name="trash" size={13} /> Delete transition</button>
                </div>
              </div>
              <div className="border-t border-white/10 pt-3">
                <p className="mb-2 text-[11px] text-neutral-500">Drag a transition onto a block on the timeline, or click one to apply it to the seam selected above{seamIndex > 0 && seamIndex < segments.length ? <> (<span className="font-bold text-neutral-300">{seamIndex}→{seamIndex + 1}</span>)</> : null}. The block&rsquo;s width is the transition&rsquo;s length — drag it to lengthen.</p>
                <FadeTransitionLibrary selectedId={activeSeam.type} onApply={(id) => applySeamTransition(seamIndex, id)} />
                {transitionById(activeSeam.type)?.approx && <p className="mt-2 text-[11px] text-amber-400/80">The preview for {transitionLabel(activeSeam.type)} is an approximation — the rendered result will differ in detail.</p>}
              </div>
            </div>}
            {editorTool === "volume" && activeSegment && (
              <section aria-labelledby="attached-audio-settings-heading">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon name="audio" size={15} className="shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                      <h3
                        id="attached-audio-settings-heading"
                        className="text-sm font-bold text-white"
                      >
                        Audio Clip Settings
                      </h3>
                      <p className="max-w-80 truncate text-xs text-neutral-500">
                        {activeSegment.media.name} · Original clip audio
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={onAudioUpload} disabled={audioUploading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-white transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><Icon name="plus" size={14} />{audioUploading ? "Uploading…" : "Add Audio Clip"}</button>
                    <button
                      type="button"
                      onClick={() => requestDetach(activeSegment, "delete")}
                      aria-label={`Remove audio from ${activeSegment.media.name}`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 text-xs font-bold text-red-200 transition-colors hover:border-red-300/40 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      <Icon name="trash" size={14} />
                      Delete
                    </button>
                  </div>
                </div>
                <label className="mt-4 block max-w-xl text-xs font-semibold text-neutral-300">
                  {activeSegment.audioRemoved
                    ? "Audio removed from this clip"
                    : `Volume · ${Math.round((activeSegment.volume ?? 1) * 100)}%`}
                  {/* Once this clip's audio has been detached or deleted it lives
                      somewhere else (an audio row, or nowhere) — dragging this
                      slider would silently bring it back on top of the detached
                      copy, which is the double-audio bug. Undo is the way back. */}
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={activeSegment.volume ?? 1}
                    disabled={activeSegment.audioRemoved}
                    onChange={(event) => setActiveVolume(Number(event.target.value))}
                    title={activeSegment.audioRemoved ? "This clip's audio was removed — undo to bring it back." : "Browsers cap live preview volume at 100% — the exported video plays at the full level you set here."}
                    className="mt-3 w-full accent-primary disabled:opacity-40"
                  />
                  {(activeSegment.volume ?? 1) > 1 && (
                    <span className="mt-1.5 block text-[11px] font-normal text-neutral-500">
                      This preview is capped at 100% (a browser limit) — the exported video will be
                      louder, at the full {Math.round((activeSegment.volume ?? 1) * 100)}% you’ve
                      set.
                    </span>
                  )}
                </label>
              </section>
            )}
            {editorTool === "audio" && (() => {
              const selectedClip = audioClips.find((clip) => clip.id === selectedAudioClipId);
              if (!selectedClip) {
                return <section aria-labelledby="empty-audio-clip-settings-heading">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon name="audio" size={15} className="shrink-0 text-neutral-400" />
                      <div><h3 id="empty-audio-clip-settings-heading" className="text-sm font-bold text-white">Audio Clip Settings</h3><p className="text-xs text-neutral-500">Select an audio clip on the timeline, or add another.</p></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={onAudioUpload} disabled={audioUploading} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-black transition-colors hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><Icon name="upload" size={14} />{audioUploading ? "Uploading…" : "Add Audio Clip"}</button>
                      <button type="button" onClick={onAudioLibrary} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-white transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon name="image" size={14} />Library</button>
                    </div>
                  </div>
                </section>;
              }
              const id = selectedClip.id;
              return <section aria-labelledby="audio-clip-settings-heading">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon name="audio" size={15} className="shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                      <h3 id="audio-clip-settings-heading" className="text-sm font-bold text-white">
                        Audio Clip Settings
                      </h3>
                      <p className="truncate text-xs text-neutral-500">
                        {selectedClip.name}
                        {selectedClip.kind === "detached" ? " · Detached from video" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={onAudioUpload} disabled={audioUploading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-white transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><Icon name="plus" size={14} />{audioUploading ? "Uploading…" : "Add Audio Clip"}</button>
                    <button
                      type="button"
                      onClick={() => {
                        beginEditorEdit();
                        setAudioClips((current) => current.filter((clip) => clip.id !== id));
                        setSelectedAudioClipId(null);
                      }}
                      aria-label={`Delete audio clip ${selectedClip.name}`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 text-xs font-bold text-red-200 transition-colors hover:border-red-300/40 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      <Icon name="trash" size={14} />
                      Delete
                    </button>
                  </div>
                </div>
                <label className="mt-3 block max-w-xl text-xs font-semibold text-neutral-300">Volume · {Math.round(selectedClip.volume * 100)}%
                  <input type="range" min="0" max="2" step="0.05" value={selectedClip.volume} onPointerDown={beginEditorEdit} onChange={(event) => { const volume = Number(event.target.value); setAudioClips((current) => current.map((clip) => (clip.id === id ? { ...clip, volume } : clip))); }} title="Browsers cap live preview volume at 100% — the exported video plays at the full level you set here." className="mt-2 w-full accent-primary" />
                  {selectedClip.volume > 1 && <span className="mt-1.5 block text-[11px] font-normal text-neutral-500">This preview is capped at 100% (a browser limit) — the exported video will be louder, at the full {Math.round(selectedClip.volume * 100)}% you’ve set.</span>}
                </label>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-semibold text-neutral-300"><span className="flex items-center justify-between"><span>Start</span><span className="font-mono text-neutral-400">{selectedClip.start.toFixed(1)}s</span></span>
                    <input type="range" min="0" max={Math.max(0.1, selectedClip.end - 0.2)} step="0.1" value={selectedClip.start} onPointerDown={beginEditorEdit} onChange={(event) => { const start = Math.min(selectedClip.end - 0.2, Math.max(0, Number(event.target.value))); const sourceStart = selectedClip.sourceStart + (start - selectedClip.start); setAudioClips((current) => current.map((clip) => (clip.id === id ? { ...clip, start, sourceStart } : clip))); }} className="mt-3 w-full accent-primary" />
                  </label>
                  <label className="text-xs font-semibold text-neutral-300"><span className="flex items-center justify-between"><span>End</span><span className="font-mono text-neutral-400">{selectedClip.end.toFixed(1)}s</span></span>
                    <input type="range" min={selectedClip.start + 0.2} max={timelineDuration} step="0.1" value={selectedClip.end} onPointerDown={beginEditorEdit} onChange={(event) => { const end = Math.max(selectedClip.start + 0.2, Math.min(timelineDuration, Number(event.target.value))); const sourceEnd = selectedClip.sourceEnd + (end - selectedClip.end); setAudioClips((current) => current.map((clip) => (clip.id === id ? { ...clip, end, sourceEnd } : clip))); }} className="mt-3 w-full accent-primary" />
                  </label>
                </div>
              </section>;
            })()}
            {editorTool === "captions" && (!selectedCaptionLayer ? (
              <section aria-labelledby="empty-text-overlay-settings-heading" className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2"><Icon name="type" size={15} className="shrink-0 text-neutral-400" /><div><h3 id="empty-text-overlay-settings-heading" className="text-sm font-bold text-white">Text Overlay Settings</h3><p className="text-xs text-neutral-500">Select a text overlay on the timeline, or add another.</p></div></div>
                <button type="button" onClick={addCaptionLayer} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-black transition-colors hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon name="plus" size={14} />Add Text Overlay</button>
              </section>
            ) : (
              <div data-keep-selection>
                <section aria-labelledby="caption-settings-heading">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon name="type" size={15} className="text-neutral-400" />
                      <h3 id="caption-settings-heading" className="text-sm font-bold text-white">Text Overlay Settings</h3>
                    </div>
                    <button type="button" onClick={addCaptionLayer} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-white transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon name="plus" size={14} />Add Text Overlay</button>
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-neutral-300">
                      Overlay text
                      <textarea
                        rows={2}
                        maxLength={200}
                        value={selectedCaptionLayer.text}
                        onFocus={beginEditorEdit}
                        onChange={(event) => patchCaption({ text: event.target.value })}
                        placeholder="Enter the text shown on the video"
                        className="mt-1.5 min-h-11 w-full resize-y rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm leading-5 text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-primary focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        beginEditorEdit();
                        const id = selectedCaptionLayer.id;
                        setCaptionLayers((current) => current.filter((l) => l.id !== id));
                        setSelectedCaptionId(null);
                      }}
                      aria-label="Delete selected text overlay"
                      className="mb-px inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 text-xs font-bold text-red-200 transition-colors hover:border-red-300/40 hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      <Icon name="trash" size={14} />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </section>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-semibold text-neutral-300"><span className="flex items-center justify-between"><span>Start</span><span className="font-mono text-neutral-400">{selectedCaptionLayer.start.toFixed(1)}s</span></span>
                    <input type="range" min="0" max={Math.max(0.1, selectedCaptionLayer.end - 0.5)} step="0.1" value={selectedCaptionLayer.start} onPointerDown={beginEditorEdit} onChange={(event) => { const id = selectedCaptionLayer.id; const end = selectedCaptionLayer.end; const start = Math.min(end - 0.5, Number(event.target.value)); setCaptionLayers((current) => current.map((l) => (l.id === id ? { ...l, start } : l))); setPreviewTime(start); }} className="mt-3 w-full accent-primary" />
                  </label>
                  <label className="text-xs font-semibold text-neutral-300"><span className="flex items-center justify-between"><span>End</span><span className="font-mono text-neutral-400">{selectedCaptionLayer.end.toFixed(1)}s</span></span>
                    <input type="range" min={selectedCaptionLayer.start + 0.5} max={timelineDuration} step="0.1" value={selectedCaptionLayer.end} onPointerDown={beginEditorEdit} onChange={(event) => { const id = selectedCaptionLayer.id; const start = selectedCaptionLayer.start; const end = Math.max(start + 0.5, Number(event.target.value)); setCaptionLayers((current) => current.map((l) => (l.id === id ? { ...l, end } : l))); }} className="mt-3 w-full accent-primary" />
                  </label>
                </div>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <button type="button" aria-expanded={advancedCaptionOpen} onClick={() => setAdvancedCaptionOpen((v) => !v)} className="flex min-h-10 items-center gap-2 rounded-lg px-1 text-xs font-bold text-neutral-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon name="gear" size={14} />Advanced text settings<Icon name={advancedCaptionOpen ? "chevronUp" : "chevronDown"} size={13} /></button>
                  {advancedCaptionOpen && <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-5 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-neutral-500">Font</p>
                      <div className="flex flex-wrap gap-1">
                        {FADE_FONTS.map((f) => <button key={f.id} type="button" onClick={() => patchCaption({ font: f.id })} style={{ fontFamily: f.stack }} className={`rounded-lg px-2.5 py-1.5 text-sm font-bold transition-colors ${selectedCaptionLayer.font === f.id ? "border border-primary bg-white/10 text-white" : "border border-transparent text-neutral-400 hover:text-white"}`}>{f.name}</button>)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-neutral-500">Font Size</p>
                      <div className="flex flex-wrap gap-1">
                        {FADE_CAPTION_SIZE_PRESETS.map((size) => <button key={size.id} type="button" onClick={() => patchCaption({ scale: size.scale })} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${selectedCaptionLayer.scale === size.scale ? "border border-primary bg-white/10 text-white" : "border border-transparent text-neutral-400 hover:text-white"}`}>{size.name}</button>)}
                      </div>
                      <input type="range" min={FADE_CAPTION_SCALE_MIN} max={FADE_CAPTION_SCALE_MAX} step={0.25} value={selectedCaptionLayer.scale} onChange={(event) => patchCaption({ scale: Number(event.target.value) })} aria-label="Font size" className="mt-3 w-full cursor-pointer accent-primary" />
                      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-neutral-400">Size
                        <span className="flex items-center rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                          <input type="number" min={FADE_CAPTION_SCALE_MIN} max={FADE_CAPTION_SCALE_MAX} step={0.25} value={selectedCaptionLayer.scale} onChange={(event) => patchCaption({ scale: clamp(Number(event.target.value), FADE_CAPTION_SCALE_MIN, FADE_CAPTION_SCALE_MAX) })} className="w-14 bg-transparent text-right font-mono text-xs font-bold text-white outline-none" aria-label="Font size value" />
                          <span className="ml-1 font-mono text-neutral-500">cqw</span>
                        </span>
                      </label>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-neutral-500">Style</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {FADE_TEXT_STYLES.map((style) => <button key={style.id} type="button" onClick={() => patchCaption({ style: style.id })} aria-pressed={selectedCaptionLayer.style === style.id} title={style.name} className={`flex h-12 items-center justify-center rounded-lg border p-1.5 transition-colors ${selectedCaptionLayer.style === style.id ? "border-primary ring-2 ring-primary/30" : "border-white/10 hover:border-primary/50"}`}>
                          <span className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-neutral-500 via-neutral-600 to-neutral-800">
                            <span className={`rounded px-1.5 py-0.5 text-sm font-black ${style.className}`} style={{ color: selectedCaptionLayer.color || style.fill, ...(selectedCaptionLayer.bgEnabled ? { backgroundColor: fadeHexToRgba(selectedCaptionLayer.bgColor, selectedCaptionLayer.bgOpacity ?? 100) } : {}) }}>Aa</span>
                          </span>
                        </button>)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-neutral-500">Font Color</p>
                      <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                        <input type="color" value={selectedCaptionLayer.color || FADE_CAPTION_COLOR_DEFAULT} onChange={(event) => patchCaption({ color: event.target.value })} className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0" aria-label="Font color" />
                        <input type="text" value={selectedCaptionLayer.color || FADE_CAPTION_COLOR_DEFAULT} onChange={(event) => patchCaption({ color: event.target.value })} className="w-full min-w-0 bg-transparent font-mono text-xs font-bold text-white outline-none" aria-label="Font color hex code" spellCheck={false} />
                      </label>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-neutral-500">Text Background</p>
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" onClick={() => patchCaption({ bgEnabled: false })} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${!selectedCaptionLayer.bgEnabled ? "border border-primary bg-white/10 text-white" : "border border-transparent text-neutral-400 hover:text-white"}`}>None</button>
                        <button type="button" onClick={() => patchCaption({ bgEnabled: true })} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${selectedCaptionLayer.bgEnabled ? "border border-primary bg-white/10 text-white" : "border border-transparent text-neutral-400 hover:text-white"}`}>Color</button>
                        {selectedCaptionLayer.bgEnabled && <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                          <input type="color" value={selectedCaptionLayer.bgColor} onChange={(event) => patchCaption({ bgColor: event.target.value })} className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0" aria-label="Text background color" />
                          <input type="text" value={selectedCaptionLayer.bgColor} onChange={(event) => patchCaption({ bgColor: event.target.value })} className="w-20 min-w-0 bg-transparent font-mono text-xs font-bold text-white outline-none" aria-label="Text background color hex code" spellCheck={false} />
                        </label>}
                      </div>
                      {selectedCaptionLayer.bgEnabled && <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="shrink-0 text-xs font-semibold text-neutral-400">Opacity</span>
                        <input type="range" min={0} max={100} step={1} value={selectedCaptionLayer.bgOpacity} onChange={(event) => patchCaption({ bgOpacity: Number(event.target.value) })} aria-label="Background opacity" className="min-w-24 flex-1 cursor-pointer accent-primary" />
                        <span className="flex shrink-0 items-center rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                          <input type="number" min={0} max={100} step={1} value={selectedCaptionLayer.bgOpacity} onChange={(event) => patchCaption({ bgOpacity: Math.round(clamp(Number(event.target.value), 0, 100)) })} className="w-10 bg-transparent text-right font-mono text-xs font-bold text-white outline-none" aria-label="Background opacity value" />
                          <span className="ml-1 font-mono text-xs text-neutral-500">%</span>
                        </span>
                      </div>}
                    </div>
                  </div>}
                </div>
              </div>
            ))}
          </div>
          <div data-keep-selection className="flex items-stretch justify-between gap-1 overflow-x-auto bg-[#0d0d0d] px-3 py-2">
            <button
              type="button"
              onClick={splitSelectedItem}
              disabled={!canSplitSelectedItem}
              title={
                canSplitSelectedItem
                  ? `Split selected ${splitTarget} at the playhead`
                  : `Move the playhead inside the selected ${splitTarget} to split it`
              }
              className="flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white disabled:opacity-35"
            >
              <Icon name="scissors" size={19} />
              Split
            </button>
            <button type="button" aria-pressed={editorTool === "trim"} onClick={() => { setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("trim"); }} className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium hover:bg-white/10 hover:text-white ${editorTool === "trim" ? "bg-white/10 text-white" : "text-neutral-300"}`}><Icon name="trim" size={19} />Trim</button>
            <button type="button" onClick={duplicateActive} disabled={segments.length >= MAX_FADE_SEGMENTS} className="flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white disabled:opacity-35"><Icon name="copy" size={19} />Duplicate</button>
            <button type="button" onClick={onUpload} className="flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white"><Icon name="upload" size={19} />Upload</button>
            <button type="button" onClick={onLibrary} className="flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white"><Icon name="image" size={19} />Library</button>
            <button type="button" onClick={onCrop} className="flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white"><Icon name="expand" size={19} />Recrop</button>
            <button type="button" aria-pressed={editorTool === "transition"} onClick={() => { setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("transition"); }} className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium hover:bg-white/10 hover:text-white ${editorTool === "transition" ? "bg-white/10 text-white" : "text-neutral-300"}`}><Icon name="sparkles" size={19} />Transition</button>
            <button type="button" aria-pressed={editorTool === "volume"} onClick={() => { setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("volume"); }} className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium hover:bg-white/10 hover:text-white ${editorTool === "volume" ? "bg-white/10 text-white" : "text-neutral-300"}`}><Icon name="audio" size={19} />Volume</button>
            <button type="button" aria-pressed={editorTool === "audio"} onClick={() => { setSelectedCaptionId(null); setSelectedAudioClipId(null); setEditorTool("audio"); }} className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium hover:bg-white/10 hover:text-white ${editorTool === "audio" ? "bg-white/10 text-white" : "text-neutral-300"}`}><Icon name="audio" size={19} />Audio</button>
            <button type="button" aria-pressed={editorTool === "captions"} onClick={() => { setSelectedAudioClipId(null); setSelectedCaptionId(null); setEditorTool("captions"); }} className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium hover:bg-white/10 hover:text-white ${editorTool === "captions" ? "bg-white/10 text-white" : "text-neutral-300"}`}><Icon name="type" size={19} />Text</button>
          </div>
          {audioClips.map((clip) => (
            <audio
              key={clip.id}
              ref={(node) => {
                if (node) audioPreviewRefs.current.set(clip.id, node);
                else audioPreviewRefs.current.delete(clip.id);
              }}
              src={`/api/media-file/${clip.mediaId}`}
              preload="metadata"
            />
          ))}
        </div>}
        {rendering && <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-xs font-semibold text-muted"><span className="flex items-center gap-2"><span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />Rendering</span>{Object.keys(platformRenderStatuses).map((platformId) => <span key={platformId} className="inline-flex items-center gap-1 rounded-full border border-line bg-page px-2 py-1"><PlatformIcon id={platformId} size={12} />{platformOf(platformId)?.name ?? platformId} · {renderStatusLabel(platformRenderStatuses[platformId])}</span>)}<span className="tabular-nums">{renderElapsedSeconds}s elapsed</span><span className="hidden xl:inline">You can leave while this runs.</span></div>}
        {!buildReady || !hasRenderedOutput ? <p className="px-5 py-3 text-sm font-semibold text-muted">{buildHint}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <button type="button" onClick={() => history.back()} className="btn-subtle"><Icon name="chevronLeft" size={15} /> Back</button>
          <div className="flex items-center gap-2">
            {segments.length > 0 && selectedPlatforms.length > 0 && <button type="button" onClick={() => setRenderScopeOpen(true)} disabled={rendering} className="btn-subtle disabled:opacity-50"><Icon name="sparkles" size={15} /> {rendersAreCurrent ? "Re-render" : "Render"}</button>}
            {Object.keys(platformOutputMediaIds).length > 0 && <button type="button" data-edit-guard-exempt onClick={() => setPreviewOpen(true)} className="btn-subtle"><Icon name="play" size={15} /> Preview</button>}
            <button type="button" onClick={() => setStep(1)} disabled={!buildReady || !hasRenderedOutput || uploading} title={buildHint || undefined} className="btn-primary disabled:opacity-50">Continue to captions <Icon name="chevronRight" size={15} /></button>
          </div>
        </div>
        <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(event) => { if (event.target.files?.[0]) onFile(event.target.files[0]); event.target.value = ""; }} />
        {renderScopeOpen && <FadeRenderScopeDialog platforms={selectedPlatforms} defaultChecked={dirtyRenderPlatforms.length > 0 ? dirtyRenderPlatforms : selectedPlatforms} onClose={() => setRenderScopeOpen(false)} onRender={(targets) => { setRenderScopeOpen(false); startRender(targets); }} />}
        {previewOpen && <FadePreviewModal platformOutputMediaIds={platformOutputMediaIds} activePlatform={previewPlatform} onSelectPlatform={setPreviewPlatform} onClose={() => setPreviewOpen(false)} />}
        {detachPending && <FadeDetachAudioDialog action={detachPending.action} onClose={() => setDetachPending(null)} onConfirm={confirmDetach} />}
      </section>
      {error && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
    </div>;
  }

  return <div className="fade-up relative mx-auto w-full max-w-5xl pb-10" onClickCapture={editGuard.guard} onPointerDownCapture={editGuard.guard} onKeyDownCapture={editGuard.guard}>
    {editGuard.dialog}
    <button type="button" onClick={() => history.back()} data-edit-guard-exempt className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-primary-deep"><Icon name="chevronLeft" size={15} /> Content Studio</button>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white"><Icon name="video" size={18} /></span>Video Editor Studio</h1><p className="mt-1 text-sm text-muted">Build a short sequence, split clips, and control how every transition lands.</p></div>{draftLocked && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-deep"><Icon name="check" size={13} /> Finished</span>}</div>
    <div className="card mt-5 px-6 py-5" data-edit-guard-exempt><div className="flex items-center">{FADE_WORKFLOW_STEPS.map((label, index) => <div key={label} className="flex flex-1 items-center last:flex-none"><button type="button" onClick={() => goTo(index)} className="group flex min-h-11 min-w-11 flex-col items-center gap-2 rounded-lg px-1"><span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black ${index < step ? "border-primary bg-primary text-white" : index === step ? "border-primary bg-primary-soft text-primary-deep ring-4 ring-primary-soft/70" : "border-line bg-white text-muted"}`}>{index < step ? <Icon name="check" size={17} /> : index + 1}</span><span className={`text-xs font-black uppercase tracking-[0.12em] ${index === step ? "text-primary-deep" : index < step ? "text-ink" : "text-muted"}`}>{label}</span></button>{index < 2 && <span className={`mx-4 mb-8 h-0.5 flex-1 sm:mx-8 ${index < step ? "bg-primary" : "bg-line"}`} />}</div>)}</div></div>
    {draftStatus !== "idle" && <div className="mt-3 flex justify-end"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">{draftStatus === "saving" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/25 border-t-primary" /> : <Icon name="check" size={13} className="text-primary" />}{draftStatus === "saving" ? "Saving draft…" : "Saved as draft"}</span></div>}
    <div className="card mt-4 p-5 sm:p-6"><div className="flex items-center justify-between gap-3 border-b border-line pb-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Step {step + 1} of 3</p><h2 className="text-lg font-bold">{FADE_WORKFLOW_STEPS[step]}</h2></div>{uploading && <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-deep"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" /> {uploadStage}</span>}</div>
      {step === 1 && (
        <div className="mt-5">
          <FadePlatformPreview platformOutputMediaIds={platformOutputMediaIds} activePlatform={previewPlatform} onSelectPlatform={setPreviewPlatform} />
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">AI caption brief</p>
              {selectedPlatforms.length > 0 && (
                <div className="flex items-center gap-1 rounded-lg bg-page p-0.5">
                  {CAPTION_LENGTHS.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCaptionLength(id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${captionLength === id ? "bg-white text-primary-deep shadow-sm" : "text-muted hover:text-ink"}`}
                      title={`AI Auto-fill writes a ${label.toLowerCase()} caption`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} className="input mt-2 h-20 resize-y" placeholder="Describe the video, audience, and key message…" />
            <p className="mt-2 text-sm text-muted">This is an AI prompt used by Auto-fill to write platform-specific captions below.</p>
          </div>
          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Platform captions (optional)</p>
            {selectedPlatforms.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Select accounts under Post To on the Build step to write a caption for each platform.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {selectedPlatforms.map((id) => {
                  const max = CAPTION_MAX_BY_PLATFORM[id as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? PLATFORM_CAPTION_MAX;
                  const value = platformCaptions[id] ?? "";
                  const tone = toneResults[id];
                  const rendered = !!platformOutputMediaIds[id];
                  return (
                    <div key={id}>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-sm font-bold text-ink">
                          <PlatformIcon id={id} size={14} /> {platformOf(id)?.name ?? id}
                        </label>
                        <span className={`text-xs font-semibold ${value.length >= max ? "text-red-600" : "text-muted"}`}>
                          {value.length}/{max}
                        </span>
                      </div>
                      {!rendered && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                          <Icon name="sparkles" size={12} /> Render the video for {platformOf(id)?.name ?? id} before this caption can be used.
                        </p>
                      )}
                      <div className="mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                        <textarea
                          className="h-20 w-full resize-y border-0 bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:ring-0"
                          maxLength={max}
                          value={value}
                          onChange={(event) => {
                            setPlatformCaptions((c) => ({ ...c, [id]: event.target.value }));
                            setToneResults((r) => {
                              if (!(id in r)) return r;
                              const next = { ...r };
                              delete next[id];
                              return next;
                            });
                          }}
                          placeholder={`Caption for ${platformOf(id)?.name ?? id}…`}
                        />
                        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-2">
                          <CaptionCopyButton value={value} compact />
                          <button type="button" onClick={() => generateCaption(id)} disabled={captionBusy[id] || !caption.trim()} title={!caption.trim() ? "Add an AI caption brief above first" : undefined} className="btn-subtle !py-1 text-xs disabled:opacity-50">
                            {captionBusy[id] ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" /> : <Icon name="sparkles" size={12} />}
                            {captionBusy[id] ? "Writing…" : "AI Auto-fill"}
                          </button>
                          <button type="button" onClick={() => checkTone(id)} disabled={!value.trim()} className="btn-subtle !py-1 text-xs disabled:opacity-50">
                            <Icon name="search" size={12} /> Check Tone
                          </button>
                          {tone && tone.level !== "natural" && (
                            <button type="button" onClick={() => improveCaption(id)} disabled={improveBusy[id]} className="btn-subtle !py-1 text-xs disabled:opacity-50">
                              {improveBusy[id] ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" /> : <Icon name="sparkles" size={12} />}
                              {improveBusy[id] ? "Improving…" : "Make it sound less AI"}
                            </button>
                          )}
                        </div>
                        {tone && (
                          <div className="border-t border-line bg-page/50 px-3 py-2">
                            <p className={`text-xs font-bold ${tone.level === "high" ? "text-red-600" : tone.level === "some" ? "text-amber-700" : "text-emerald-700"}`}>
                              {tone.level === "high" ? "Sounds very AI-generated" : tone.level === "some" ? "A little AI-ish" : "Sounds natural"}
                            </p>
                            {tone.matches.length > 0 && <p className="mt-0.5 text-xs text-muted">Flagged: &ldquo;{tone.matches.join("”, “")}&rdquo;</p>}
                          </div>
                        )}
                      </div>
                      {captionError[id] && <p className="mt-1 text-xs font-semibold text-red-600">{captionError[id]}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {step === 2 && (() => {
        const reviewPlatformIds = Object.keys(platformOutputMediaIds);
        const activeReviewPlatform = (previewPlatform && platformOutputMediaIds[previewPlatform]) ? previewPlatform : reviewPlatformIds[0];
        const activeReviewCaption = activeReviewPlatform ? platformCaptions[activeReviewPlatform] ?? "" : "";
        const activeReviewMax = activeReviewPlatform ? CAPTION_MAX_BY_PLATFORM[activeReviewPlatform as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? PLATFORM_CAPTION_MAX : PLATFORM_CAPTION_MAX;
        const notRendered = selectedPlatforms.filter((id) => !platformOutputMediaIds[id]);
        return (
          <div className="mt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Campaign</p>
                <h3 className="text-xl font-bold">{campaignName}</h3>
              </div>
              <div className="text-right"><span className={`inline-flex rounded-lg border px-3 py-2 text-sm font-semibold ${publishScheduleIsPast ? "border-amber-200 bg-amber-50 text-amber-800" : "border-line bg-page text-muted"}`}>{schedule}</span>{publishScheduleIsPastToday ? <p className="mt-1.5 flex items-center justify-end gap-1.5 text-xs font-semibold text-amber-700" role="alert"><Icon name="warningTriangle" size={14} />This time has already passed. Posting immediately.</p> : publishScheduleIsPast && <p className="mt-1.5 flex items-center justify-end gap-1.5 text-xs font-semibold text-red-700" role="alert"><Icon name="warningTriangle" size={14} />Can't schedule in the past.</p>}</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {selectedPlatforms.map((id) => (
                <span key={id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${platformOutputMediaIds[id] ? "border-line bg-page text-ink" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                  <PlatformIcon id={id} size={13} />{platformOf(id)?.name ?? id}
                  {!platformOutputMediaIds[id] && <Icon name="warningTriangle" size={11} />}
                </span>
              ))}
            </div>
            {notRendered.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <Icon name="warningTriangle" size={14} className="mt-0.5 shrink-0" />
                {notRendered.length === 1
                  ? `${platformOf(notRendered[0])?.name ?? notRendered[0]} hasn't been rendered yet — go back and render it before finishing.`
                  : `${notRendered.map((id) => platformOf(id)?.name ?? id).join(", ")} haven't been rendered yet — go back and render them before finishing.`}
              </p>
            )}
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                <div className="border-b border-line px-4 py-3 text-sm font-semibold">{selectedAccountIds.size} selected destination{selectedAccountIds.size === 1 ? "" : "s"}</div>
                <div className="p-4"><FadePlatformPreview platformOutputMediaIds={platformOutputMediaIds} activePlatform={previewPlatform} onSelectPlatform={setPreviewPlatform} /></div>
              </div>
              <div className="rounded-xl border border-line bg-white p-4">
                {activeReviewPlatform ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><PlatformIcon id={activeReviewPlatform} size={14} /> {platformOf(activeReviewPlatform)?.name ?? activeReviewPlatform} caption</p>
                      <span className={`text-xs font-semibold ${activeReviewCaption.length >= activeReviewMax ? "text-red-600" : "text-muted"}`}>{activeReviewCaption.length}/{activeReviewMax}</span>
                    </div>
                    {activeReviewCaption ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{activeReviewCaption}</p>
                    ) : (
                      <p className="mt-2 text-sm italic text-muted">No caption written for {platformOf(activeReviewPlatform)?.name ?? activeReviewPlatform} yet — go back to Captions to add one.</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted">Render a video to preview its captions here.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {error && <p className="mt-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-8 flex items-center justify-between border-t border-line pt-5" data-edit-guard-exempt><button type="button" onClick={() => setStep((current) => current - 1)} className="btn-subtle"><Icon name="chevronLeft" size={15} /> Back</button>{step === 1 ? <button type="button" onClick={() => setStep(2)} className="btn-primary">Review <Icon name="chevronRight" size={15} /></button> : <div className="flex items-center gap-2">{!!outputMediaId && finishedMediaId === outputMediaId ? <button type="button" disabled className="btn-subtle text-primary-deep"><Icon name="check" size={15} /> Finished</button> : <button type="button" onClick={() => void finish()} disabled={!outputMediaId || finishing || (publishScheduleIsPast && !publishScheduleIsPastToday)} title={publishScheduleIsPast && !publishScheduleIsPastToday ? "Update the date and time on the Build step before finishing." : undefined} className="btn-primary disabled:opacity-50">{finishing ? "Finishing…" : publishScheduleIsPast && !publishScheduleIsPastToday ? <><Icon name="warningTriangle" size={15} /> Update schedule</> : "Finish"}</button>}{!!outputMediaId && finishedMediaId === outputMediaId && <button type="button" onClick={() => void publish()} disabled={finishing} className="btn-primary disabled:opacity-50">{finishing ? "Preparing…" : <>Publish <Icon name="sparkles" size={15} /></>}</button>}</div>}</div>
      <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(event) => { if (event.target.files?.[0]) onFile(event.target.files[0]); event.target.value = ""; }} />
    </div>
  </div>;
}

function FadeVideoEditor({ onExit, accounts, initialClip, initialCaption, initialDraft, initialDraftId, initialDraftStatus }: { onExit: () => void; accounts: FadeInAccount[]; initialClip: ComposerMedia | null; initialCaption: string; initialDraft?: FadeDraftSnapshot; initialDraftId?: string; initialDraftStatus?: string }) {
  const [segments, setSegments] = useState<FadeTimelineSegment[]>(() => initialDraft?.segments?.length
    // Drafts saved before per-seam transitions get the old whole-sequence
    // setting backfilled onto every seam (segment 0 from the old dedicated
    // opening-fade field instead), so they resume looking identical.
    ? withSeams(
        initialDraft.segments.map((segment) => ({ ...segment, volume: Number.isFinite(segment.volume) ? segment.volume : 1 })),
        { type: initialDraft.transition ?? DEFAULT_TRANSITION_ID, duration: initialDraft.transitionDuration ?? DEFAULT_TRANSITION_DURATION },
        { type: (initialDraft.fadeInDuration ?? 0) > 0 ? "fade" : "cut", duration: initialDraft.fadeInDuration || 0.6 },
      )
    : initialClip ? [{ id: crypto.randomUUID(), media: initialClip, start: 0, end: null, duration: null, volume: 1, crops: { default: { x: 0.5, y: 0.5 } } }] : []);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(() => initialDraft?.segments?.[0]?.id ?? null);
  const [splitAt, setSplitAt] = useState(1);
  const [transition, setTransition] = useState<FadeTransition>(() => initialDraft?.transition ?? "fade");
  const [transitionDuration, setTransitionDuration] = useState(() => initialDraft?.transitionDuration ?? 0.5);
  // No opening fade by default here — the default is on segment 0 itself
  // (either freshly stamped by addMedia, or backfilled above from an old draft).
  const [closingSeam, setClosingSeam] = useState<FadeSeam>(() => initialDraft?.closingSeam ?? { type: "cut", duration: 0.5 });
  const [audioClips, setAudioClips] = useState<FadeAudioClip[]>(() => initialDraft?.audioClips ?? []);
  const [selectedAudioClipId, setSelectedAudioClipId] = useState<string | null>(null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioLibraryOpen, setAudioLibraryOpen] = useState(false);
  // Timed text overlays baked into the export — separate from `caption`
  // below (plain post text, never rendered). See the captions-timeline
  // section near the top of this file for the type/rasterizer.
  const [captionLayers, setCaptionLayers] = useState<FadeTextLayer[]>(() => initialDraft?.captionLayers ?? []);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  // Clicking anywhere outside a caption box or its styling panel clears the
  // selection (so its border/handles disappear) — same idiom as slideshow's
  // text layers. Clicks on a caption box or its resize/delete controls stop
  // propagation, so they never reach here.
  useEffect(() => {
    if (!selectedCaptionId) return;
    function onDown(event: PointerEvent) {
      if ((event.target as HTMLElement).closest("[data-keep-selection]")) return;
      setSelectedCaptionId(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selectedCaptionId]);
  const [caption, setCaption] = useState(() => initialDraft?.caption ?? initialCaption);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(() => new Set(initialDraft?.selectedAccountIds ?? []));
  const [activePlatform, setActivePlatform] = useState(() => initialDraft?.activePlatform ?? "");
  const [platformFormatIds, setPlatformFormatIds] = useState<Record<string, string>>(() => initialDraft?.platformFormatIds ?? {});
  const [pendingScopeMedia, setPendingScopeMedia] = useState<ComposerMedia | null>(null);
  const [cropFlow, setCropFlow] = useState<{ segment: FadeTimelineSegment; keys: string[]; current: number } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // One job per destination platform, so Continue can require every platform
  // to have a current render instead of just whichever tab is active.
  const [jobIds, setJobIds] = useState<Record<string, string>>({});
  const [platformOutputMediaIds, setPlatformOutputMediaIds] = useState<Record<string, string>>(() => initialDraft?.platformOutputMediaIds ?? {});
  const [platformRenderStatuses, setPlatformRenderStatuses] = useState<Record<string, FadeJobStatus>>({});
  const [renderSignatures, setRenderSignatures] = useState<Record<string, string>>(() => initialDraft?.renderSignatures ?? {});
  const [pendingRenderSignatures, setPendingRenderSignatures] = useState<Record<string, string>>({});
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [renderElapsedSeconds, setRenderElapsedSeconds] = useState(0);
  const [renderScopeOpen, setRenderScopeOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);
  // Scalars mirroring the maps' aggregate state — first/overall values, kept
  // for anything (autosave, back-compat) that just wants "the" job.
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<FadeJobStatus>("idle");
  // Unlike platformOutputMediaIds, this scalar was never itself saved to the
  // draft — so a draft reopened after every platform finished rendering in a
  // PREVIOUS session came back with this stuck at null (Finish gates on it)
  // until something rendered again this session. Seed it from whichever
  // platform output the draft already restored.
  const [outputMediaId, setOutputMediaId] = useState<string | null>(
    () => Object.values(initialDraft?.platformOutputMediaIds ?? {})[0] ?? null,
  );
  const [error, setError] = useState("");
  const undoStack = useRef<FadeEditorSnapshot[]>([]);
  const redoStack = useRef<FadeEditorSnapshot[]>([]);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const input = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const activeSegment = segments.find((segment) => segment.id === activeSegmentId) ?? segments[0] ?? null;
  const rendering = status === "queued" || status === "generating" || status === "compositing";

  const selectedPlatforms = Array.from(new Set([...selectedAccountIds].map((id) => accounts.find((account) => account.id === id)?.platform).filter((platform): platform is string => !!platform)));
  const currentPlatform = selectedPlatforms.includes(activePlatform) ? activePlatform : selectedPlatforms[0] ?? "default";
  // The render signature deliberately excludes caption — caption is post text
  // (matches grid-2x2's platformCaptions), never baked into the video, so
  // editing it must never mark a completed render stale.
  function renderSignatureFor(platformId: string) {
    const format = fadeFormatFor(platformId, platformFormatIds);
    return JSON.stringify({
      segments: segments.map((segment) => ({ id: segment.media.id, start: segment.start, end: segment.end, volume: segment.volume, gapBefore: segment.gapBefore ?? 0, transitionIn: segmentSeam(segment), crop: segment.crops[platformId] ?? segment.crops.default })),
      closingSeam,
      // Audio clips are shared across every platform, same as captions.
      audioClips: audioClips.map((clip) => ({ mediaId: clip.mediaId, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd, start: clip.start, volume: clip.volume })),
      preset: format.presetId,
      aspect: format.aspect.id,
      // Captions are shared across every platform (not per-platform like
      // crop), so editing one dirties every platform's render, not just this one.
      captions: captionLayers.map((layer) => ({ text: layer.text, x: layer.x, y: layer.y, width: layer.width, scale: layer.scale, font: layer.font, style: layer.style, color: layer.color, bgEnabled: layer.bgEnabled, bgColor: layer.bgColor, bgOpacity: layer.bgOpacity, start: layer.start, end: layer.end })),
    });
  }
  const dirtyRenderPlatforms = selectedPlatforms.filter(
    (platformId) => !platformOutputMediaIds[platformId] || renderSignatures[platformId] !== renderSignatureFor(platformId),
  );
  const rendersAreCurrent = selectedPlatforms.length > 0 && dirtyRenderPlatforms.length === 0;
  const renderStatusLabel = (jobStatus: FadeJobStatus | undefined) => {
    if (jobStatus === "queued") return "Queued";
    if (jobStatus === "compositing") return "Compositing";
    if (jobStatus === "generating") return "Rendering";
    if (jobStatus === "done") return "Ready";
    if (jobStatus === "failed") return "Failed";
    return "Preparing";
  };
  const captureEditorState = (): FadeEditorSnapshot => ({ segments, activeSegmentId, splitAt, transition, transitionDuration, closingSeam, captionLayers, audioClips });
  const syncHistoryState = () => setHistoryState({ canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 });
  function rememberEditorState() {
    undoStack.current = [...undoStack.current, captureEditorState()].slice(-10);
    redoStack.current = [];
    syncHistoryState();
  }
  function restoreEditorState(snapshot: FadeEditorSnapshot) {
    setSegments(snapshot.segments);
    setActiveSegmentId(snapshot.activeSegmentId);
    setSplitAt(snapshot.splitAt);
    setTransition(snapshot.transition);
    setTransitionDuration(snapshot.transitionDuration);
    setClosingSeam(snapshot.closingSeam);
    setCaptionLayers(snapshot.captionLayers);
    setAudioClips(snapshot.audioClips);
    setSelectedCaptionId(null);
    setSelectedAudioClipId(null);
  }
  function undoEdit() {
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    redoStack.current = [...redoStack.current, captureEditorState()].slice(-10);
    undoStack.current = undoStack.current.slice(0, -1);
    restoreEditorState(previous);
    syncHistoryState();
  }
  function redoEdit() {
    const next = redoStack.current.at(-1);
    if (!next) return;
    undoStack.current = [...undoStack.current, captureEditorState()].slice(-10);
    redoStack.current = redoStack.current.slice(0, -1);
    restoreEditorState(next);
    syncHistoryState();
  }
  const addMedia = (media: ComposerMedia, crops: Record<string, { x: number; y: number }> = { default: { x: 0.5, y: 0.5 } }) => {
    if (segments.length >= MAX_FADE_SEGMENTS) { setError(`A sequence can hold up to ${MAX_FADE_SEGMENTS} clips.`); return; }
    rememberEditorState();
    const segment = { id: crypto.randomUUID(), media, start: 0, end: null, duration: null, volume: 1, crops, transitionIn: { type: transition, duration: transitionDuration } };
    setSegments((current) => [...current, segment]);
    setActiveSegmentId(segment.id);
  };
  async function addFile(file: File) {
    setUploading(true);
    setUploadStage("Preparing your video for secure upload…");
    setError("");
    try {
      setUploadStage("Uploading your video…");
      const media = await uploadOneFile(file);
      setUploadStage("Upload complete — choose where to use this video.");
      setPendingScopeMedia(media);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t upload this video."); }
    finally { window.setTimeout(() => setUploadStage(""), 700); setUploading(false); }
  }
  async function addAudioFile(file: File) {
    setAudioUploading(true);
    setError("");
    try {
      const [media, duration] = await Promise.all([uploadOneFile(file), probeAudioDuration(file)]);
      rememberEditorState();
      const timelineDuration = fadeTimelineDuration(segments);
      const sourceEnd = duration > 0 ? Math.min(duration, timelineDuration || duration) : timelineDuration || 30;
      const id = crypto.randomUUID();
      setAudioClips((current) => [
        ...current,
        { id, kind: "soundtrack", mediaId: media.id, name: media.name, sourceStart: 0, sourceEnd, start: 0, end: sourceEnd, volume: 1, row: fadeFirstAvailableAudioRow(current, 0, sourceEnd) },
      ]);
      setSelectedAudioClipId(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t upload this audio file.");
    } finally {
      setAudioUploading(false);
    }
  }
  function splitActive() {
    if (!activeSegment || !activeSegment.duration) return;
    const end = activeSegment.end ?? activeSegment.duration;
    const point = Math.max(activeSegment.start + 0.1, Math.min(end - 0.1, splitAt));
    if (point <= activeSegment.start || point >= end) return;
    rememberEditorState();
    const first = { ...activeSegment, id: crypto.randomUUID(), end: point };
    // A split is a cut, not a new transition — otherwise splitting a clip
    // silently shortens the sequence by one transition's overlap.
    const second = { ...activeSegment, id: crypto.randomUUID(), start: point, gapBefore: 0, transitionIn: { type: "cut", duration: transitionDuration } };
    setSegments((current) => current.flatMap((segment) => segment.id === activeSegment.id ? [first, second] : [segment]));
    setActiveSegmentId(second.id);
  }
  function duplicateActive() {
    if (!activeSegment || segments.length >= MAX_FADE_SEGMENTS) return;
    rememberEditorState();
    const duplicate = { ...activeSegment, id: crypto.randomUUID(), gapBefore: 0, transitionIn: { type: "cut", duration: transitionDuration } };
    setSegments((current) => {
      const index = current.findIndex((segment) => segment.id === activeSegment.id);
      const next = [...current];
      next.splice(index + 1, 0, duplicate);
      return next;
    });
    setActiveSegmentId(duplicate.id);
  }
  /** Set the transition into segment `index`. Like `setActiveTrim`, the caller
   *  snapshots for undo on pointer-down so a continuous drag records once. */
  /** Set the seam at `index`: 0 is the opening (segment 0's transitionIn),
   *  segments.length is the closing (no segment to hang it on, so it lives in
   *  its own state), and everything between is a normal inter-clip seam. */
  function setSegmentSeam(index: number, seam: FadeSeam) {
    if (index < 0 || index > segments.length) return;
    if (index === segments.length) { setClosingSeam(seam); return; }
    setSegments((current) => current.map((segment, position) =>
      position === index
        ? { ...segment, transitionIn: seam, ...(seam.type !== "cut" ? { gapBefore: 0 } : {}) }
        : segment,
    ));
  }
  function setSegmentGap(id: string, gapBefore: number) {
    setSegments((current) => current.map((segment) =>
      segment.id === id
        ? {
            ...segment,
            gapBefore,
            ...(gapBefore > 0 ? { transitionIn: { type: "cut", duration: transitionDuration } as FadeSeam } : {}),
          }
        : segment,
    ));
  }
  function moveSegment(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= segments.length || to >= segments.length) return;
    rememberEditorState();
    setSegments((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function beginCropFlow(applyToAll: boolean) {
    const existing = segments.find((segment) => segment.id === cropTargetId) ?? null;
    const media = pendingScopeMedia ?? existing?.media;
    if (!media) return;
    const keys = applyToAll && selectedPlatforms.length > 0 ? selectedPlatforms : [currentPlatform];
    const segment = existing ?? { id: crypto.randomUUID(), media, start: 0, end: null, duration: null, volume: 1, crops: {} };
    setCropFlow({ segment, keys, current: 0 });
    setPendingScopeMedia(null);
    setCropTargetId(null);
  }
  /** Rasterize+upload every non-empty caption layer that changed since its
   *  last successful render (cached via renderedMediaId/renderedSignature),
   *  once — captions are shared across every platform, not per-platform like
   *  crop, so this doesn't repeat per target. */
  async function ensureCaptionUploads() {
    const layers = captionLayers.filter((layer) => layer.text.trim());
    const resolved = await Promise.all(layers.map(async (layer) => {
      const signature = fadeCaptionRenderSignature(layer);
      let mediaId = layer.renderedSignature === signature ? layer.renderedMediaId : undefined;
      if (!mediaId) {
        const blob = await renderFadeCaptionBlob(layer);
        const media = await uploadOneFile(new File([blob], "caption.png", { type: "image/png" }));
        mediaId = media.id;
      }
      return { layer, mediaId, signature };
    }));
    setCaptionLayers((current) => current.map((layer) => {
      const match = resolved.find((r) => r.layer.id === layer.id);
      return match ? { ...layer, renderedMediaId: match.mediaId, renderedSignature: match.signature } : layer;
    }));
    return resolved.map((r) => ({ media_id: r.mediaId!, start_s: r.layer.start, end_s: r.layer.end, x: r.layer.x, y: r.layer.y, width: r.layer.width }));
  }
  /** Render `targets` (platform ids) in parallel, one job each with that
   *  platform's own preset/aspect/crop. The post-text `caption` is never
   *  sent — it's not part of the video (matches grid-2x2). Timeline text
   *  overlays (`captionLayers`) ARE sent, shared across every target. */
  async function startRender(targets: string[]) {
    if (segments.length === 0 || targets.length === 0 || rendering) return;
    setError("");
    const signatures = Object.fromEntries(targets.map((platformId) => [platformId, renderSignatureFor(platformId)]));
    setJobIds({});
    setPendingRenderSignatures(signatures);
    setPlatformRenderStatuses(Object.fromEntries(targets.map((platformId) => [platformId, "queued" as FadeJobStatus])));
    setRenderStartedAt(Date.now());
    setRenderElapsedSeconds(0);
    setStatus("queued");
    try {
      const fadeCaptions = await ensureCaptionUploads();
      const started = await Promise.all(targets.map(async (platformId) => {
        const format = fadeFormatFor(platformId, platformFormatIds);
        const response = await fetch("/api/app/studio/jobs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "fade-in",
            media_ids: segments.map((segment) => segment.media.id),
            fade_segments: segments.map((segment) => ({ media_id: segment.media.id, start_s: segment.start, end_s: segment.end ?? undefined, gap_before_s: segment.gapBefore ?? 0, volume: segment.volume, crop: segment.crops[platformId] ?? segment.crops.default ?? { x: 0.5, y: 0.5 } })),
            video_preset_id: format.presetId,
            aspect_ratio: format.aspect.id,
            fade_transitions: segments.map((segment) => segmentSeam(segment)),
            fade_transition: transition,
            fade_transition_duration: transitionDuration,
            fade_closing: closingSeam,
            ...(audioClips.length > 0 ? { fade_audio_clips: audioClips.map((clip) => ({ media_id: clip.mediaId, source_start_s: clip.sourceStart, source_end_s: clip.sourceEnd, start_s: clip.start, volume: clip.volume })) } : {}),
            ...(fadeCaptions.length > 0 ? { fade_captions: fadeCaptions } : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message ?? "Couldn’t start the render.");
        return [platformId, data] as const;
      }));
      const nextJobIds = Object.fromEntries(started.map(([platformId, data]) => [platformId, data.id]));
      setJobIds(nextJobIds);
      setJobId(started[0]?.[1].id ?? null);
      setStatus(started.every(([, data]) => data.status === "done") ? "done" : "queued");
    } catch (cause) {
      setStatus("failed");
      setRenderStartedAt(null);
      setPlatformRenderStatuses((current) => Object.fromEntries(Object.keys(current).map((platformId) => [platformId, "failed" as FadeJobStatus])));
      setError(cause instanceof Error ? cause.message : "Couldn’t start the render.");
    }
  }
  useEffect(() => {
    if (!rendering || !renderStartedAt) return;
    const update = () => setRenderElapsedSeconds(Math.max(0, Math.floor((Date.now() - renderStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [rendering, renderStartedAt]);
  // One poll cycle resolves every in-flight job together, so Continue/Preview
  // can react the moment every selected platform is done, not just one.
  useEffect(() => {
    const jobs = jobIds;
    if (Object.keys(jobs).length === 0 || status === "idle" || status === "failed") return;
    if (status === "done" && Object.keys(platformOutputMediaIds).length >= Object.keys(jobs).length) return;
    const timer = window.setTimeout(async () => {
      try {
        const entries = await Promise.all(Object.entries(jobs).map(async ([platformId, id]) => {
          const response = await fetch(`/api/app/studio/jobs/${id}`);
          return [platformId, response.ok ? await response.json() : null] as const;
        }));
        if (entries.some(([, job]) => !job)) { setPollNonce((n) => n + 1); return; }
        setPlatformRenderStatuses((current) => ({ ...current, ...Object.fromEntries(entries.map(([platformId, job]) => [platformId, job.status as FadeJobStatus])) }));
        const failed = entries.find(([, job]) => job.status === "failed")?.[1];
        if (failed) {
          setStatus("failed");
          setRenderStartedAt(null);
          setError(failed.error_message ?? "The render failed. Try again.");
          return;
        }
        const completed = Object.fromEntries(entries.filter(([, job]) => job.status === "done" && job.output_media_id).map(([platformId, job]) => [platformId, job.output_media_id]));
        if (Object.keys(completed).length > 0) {
          setPlatformOutputMediaIds((current) => ({ ...current, ...completed }));
          setRenderSignatures((current) => ({ ...current, ...Object.fromEntries(Object.keys(completed).map((platformId) => [platformId, pendingRenderSignatures[platformId]])) }));
        }
        if (entries.every(([, job]) => job.status === "done")) {
          setStatus("done");
          setOutputMediaId(Object.values(completed)[0] ?? outputMediaId ?? null);
          setRenderStartedAt(null);
        } else {
          setStatus("generating");
          setPollNonce((n) => n + 1);
        }
      } catch { setPollNonce((n) => n + 1); }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [jobIds, status, outputMediaId, platformOutputMediaIds, pendingRenderSignatures, pollNonce]);

  useEffect(() => {
    const pending = segments.filter((segment) => segment.duration === null);
    if (pending.length === 0) return;
    const cleanups = pending.map((segment) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = `/api/media-file/${segment.media.id}`;
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration)) return;
        setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, duration: video.duration } : item));
      };
      return () => { video.src = ""; };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [segments]);

  const cropFlowKey = cropFlow?.keys[cropFlow.current] ?? currentPlatform;
  const cropFlowFormat = cropFlowKey === "default" ? { aspect: VIDEO_ASPECTS[0] } : fadeFormatFor(cropFlowKey, platformFormatIds);
  const scopeOpen = pendingScopeMedia !== null || cropTargetId !== null;
  return <><FadeStudioWorkflow accounts={accounts} selectedAccountIds={selectedAccountIds} setSelectedAccountIds={setSelectedAccountIds} activePlatform={activePlatform} setActivePlatform={setActivePlatform} platformFormatIds={platformFormatIds} setPlatformFormatIds={setPlatformFormatIds} segments={segments} activeSegment={activeSegment} setActiveSegmentId={setActiveSegmentId} splitAt={splitAt} setSplitAt={setSplitAt} splitActive={splitActive} beginEditorEdit={rememberEditorState} setActiveTrim={(start, end) => { if (!activeSegment) return; setSegments((current) => current.map((segment) => segment.id === activeSegment.id ? { ...segment, start, end } : segment)); }} duplicateActive={duplicateActive} removeActive={() => { if (!activeSegment) return; rememberEditorState(); setSegments((current) => current.filter((segment) => segment.id !== activeSegment.id)); }} setActiveVolume={(volume) => { if (!activeSegment) return; rememberEditorState(); setSegments((current) => current.map((segment) => segment.id === activeSegment.id ? { ...segment, volume, audioRemoved: false } : segment)); }} muteSegmentAudio={(segmentId) => setSegments((current) => current.map((segment) => segment.id === segmentId ? { ...segment, volume: 0, audioRemoved: true } : segment))} pasteSegment={(segment, afterSegmentId) => { if (segments.length >= MAX_FADE_SEGMENTS) return; rememberEditorState(); const pasted = { ...segment, id: crypto.randomUUID(), gapBefore: 0, transitionIn: { type: "cut", duration: transitionDuration } }; setSegments((current) => { const afterIndex = afterSegmentId ? current.findIndex((s) => s.id === afterSegmentId) : -1; const next = [...current]; next.splice(afterIndex >= 0 ? afterIndex + 1 : current.length, 0, pasted); return next; }); setActiveSegmentId(pasted.id); }} undo={undoEdit} redo={redoEdit} canUndo={historyState.canUndo} canRedo={historyState.canRedo} transition={transition} setTransition={(value) => { rememberEditorState(); setTransition(value); }} transitionDuration={transitionDuration} setTransitionDuration={(value) => { rememberEditorState(); setTransitionDuration(value); }} closingSeam={closingSeam} setSegmentSeam={setSegmentSeam} setSegmentGap={setSegmentGap} moveSegment={moveSegment} audioClips={audioClips} setAudioClips={setAudioClips} selectedAudioClipId={selectedAudioClipId} setSelectedAudioClipId={setSelectedAudioClipId} audioUploading={audioUploading} onAudioUpload={() => audioInput.current?.click()} onAudioLibrary={() => setAudioLibraryOpen(true)} caption={caption} setCaption={setCaption} uploading={uploading} uploadStage={uploadStage} onUpload={() => input.current?.click()} onLibrary={() => setLibraryOpen(true)} onCrop={() => activeSegment && setCropTargetId(activeSegment.id)} fileInput={input} onFile={addFile} error={error} rendering={rendering} outputMediaId={outputMediaId} initialDraft={initialDraft} initialDraftId={initialDraftId} initialDraftStatus={initialDraftStatus}
    platformOutputMediaIds={platformOutputMediaIds} platformRenderStatuses={platformRenderStatuses} renderSignatures={renderSignatures} rendersAreCurrent={rendersAreCurrent} dirtyRenderPlatforms={dirtyRenderPlatforms} renderElapsedSeconds={renderElapsedSeconds} renderStatusLabel={renderStatusLabel} startRender={(targets) => void startRender(targets)}
    renderScopeOpen={renderScopeOpen} setRenderScopeOpen={setRenderScopeOpen} previewOpen={previewOpen} setPreviewOpen={setPreviewOpen}
    captionLayers={captionLayers} setCaptionLayers={setCaptionLayers} selectedCaptionId={selectedCaptionId} setSelectedCaptionId={setSelectedCaptionId} />{libraryOpen && <MediaLibraryModal kind="video" onClose={() => setLibraryOpen(false)} onPick={(media) => { setLibraryOpen(false); setPendingScopeMedia(media); }} />}{audioLibraryOpen && <MediaLibraryModal kind="audio" onClose={() => setAudioLibraryOpen(false)} onPick={(media) => { rememberEditorState(); const timelineDuration = fadeTimelineDuration(segments); const sourceEnd = timelineDuration || 30; const id = crypto.randomUUID(); setAudioClips((current) => [...current, { id, kind: "soundtrack", mediaId: media.id, name: media.name, sourceStart: 0, sourceEnd, start: 0, end: sourceEnd, volume: 1, row: fadeFirstAvailableAudioRow(current, 0, sourceEnd) }]); setSelectedAudioClipId(id); setAudioLibraryOpen(false); }} />}<input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={(event) => { if (event.target.files?.[0]) void addAudioFile(event.target.files[0]); event.target.value = ""; }} />{scopeOpen && <FadeUploadScopeDialog platformId={currentPlatform} platformCount={selectedPlatforms.length} onCurrent={() => beginCropFlow(false)} onAll={() => beginCropFlow(true)} onCancel={() => { setPendingScopeMedia(null); setCropTargetId(null); }} />}{cropFlow && <FadeCropModal segment={cropFlow.segment} targetAspect={cropFlowFormat.aspect} initial={cropFlow.segment.crops[cropFlowKey] ?? { x: 0.5, y: 0.5 }} progressLabel={cropFlow.keys.length > 1 ? `Crop ${cropFlow.current + 1} of ${cropFlow.keys.length} · ${platformOf(cropFlowKey)?.name ?? cropFlowKey}` : undefined} actionLabel={cropFlow.current < cropFlow.keys.length - 1 ? "Next crop" : "Save"} onClose={() => setCropFlow(null)} onSave={(crop) => { const updated = { ...cropFlow.segment, crops: { ...cropFlow.segment.crops, [cropFlowKey]: crop } }; if (cropFlow.current < cropFlow.keys.length - 1) { setCropFlow({ ...cropFlow, segment: updated, current: cropFlow.current + 1 }); } else { rememberEditorState(); setSegments((current) => current.some((segment) => segment.id === updated.id) ? current.map((segment) => segment.id === updated.id ? updated : segment) : [...current, updated]); setActiveSegmentId(updated.id); setCropFlow(null); } }} />}</>;

}


export function FadeInStudio({ accounts = [] }: { accounts?: FadeInAccount[] }) {
  const [mode, setMode] = useState<"choose" | "wizard">("choose");
  const [resumeDraft, setResumeDraft] = useState<{ id: string; state: FadeDraftSnapshot; status?: string } | null>(null);
  const [step, setStep] = useState(0);
  const [clip, setClip] = useState<ComposerMedia | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [publishDate, setPublishDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [publishTime, setPublishTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [caption, setCaption] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<FadeJobStatus>("idle");
  const [outputMediaId, setOutputMediaId] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const [renderError, setRenderError] = useState("");
  const [drafts, setDrafts] = useState<StudioDraftRow[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftId = useRef<string | undefined>(undefined);

  const selectedAccounts = accounts.filter((account) => selectedAccountIds.has(account.id));
  const selectedPlatforms = [...new Set(selectedAccounts.map((account) => account.platform))];
  const activePlatform = selectedPlatforms[0];
  const activeAccount = selectedAccounts.find((account) => account.platform === activePlatform);
  const activeCaptionMax = activePlatform ? CAPTION_MAX_BY_PLATFORM[activePlatform as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? CAPTION_MAX : CAPTION_MAX;
  const readyForCaption = campaignName.trim().length > 0 && !!clip && selectedAccountIds.size > 0;
  // Captions are optional: a clip can be rendered and reviewed without one.
  const readyForReview = readyForCaption;
  const rendering = jobStatus === "queued" || jobStatus === "generating" || jobStatus === "compositing";
  const schedule = new Date(`${publishDate}T${publishTime || "00:00"}`).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  function refetchDrafts() {
    return fetch("/api/app/studio/drafts")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setDrafts((data?.data ?? []).filter((draft: StudioDraftRow) => draft.template === "fade-in")))
      .catch(() => {})
      .finally(() => setDraftsLoading(false));
  }
  useEffect(() => {
    void refetchDrafts();
  }, []);

  useEffect(() => {
    // The active FadeVideoEditor owns draft persistence. This legacy shell
    // only lists and opens drafts, so it must never overwrite its richer state.
    if (mode === "wizard" || (!campaignName.trim() && !clip)) return;
    const timer = setTimeout(async () => {
      setDraftStatus("saving");
      try {
        const response = await fetch("/api/app/studio/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftId.current,
            template: "fade-in",
            mode: "custom",
            title: campaignName || UNTITLED_DRAFT_TITLE,
            cover_image_url: null,
            state: { step, clip, campaignName, publishDate, publishTime, selectedAccountIds: [...selectedAccountIds], caption, jobId, jobStatus, outputMediaId },
          }),
        });
        if (!response.ok) return setDraftStatus("idle");
        const saved = await response.json() as StudioDraftRow;
        draftId.current = saved.id;
        setDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)]);
        setDraftStatus("saved");
      } catch { setDraftStatus("idle"); }
    }, 900);
    return () => clearTimeout(timer);
  }, [mode, step, clip, campaignName, publishDate, publishTime, selectedAccountIds, caption, jobId, jobStatus, outputMediaId]);

  useEffect(() => {
    if (!jobId || jobStatus === "failed" || (jobStatus === "done" && outputMediaId)) return;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/app/studio/jobs/${jobId}`);
        const job = response.ok ? await response.json() : null;
        if (!job) return;
        setJobStatus(job.status);
        if (job.status === "done") {
          setOutputMediaId(job.output_media_id ?? null);
          if (job.output_media_id) setStep(2);
        } else if (job.status === "failed") setRenderError(job.error_message ?? "The render failed. Try again.");
        else setPollTick((tick) => tick + 1);
      } catch { setPollTick((tick) => tick + 1); }
    }, 2500);
    return () => clearTimeout(timer);
  }, [jobId, jobStatus, outputMediaId, pollTick]);

  function reset() { setStep(0); setClip(null); setCampaignName(""); setSelectedAccountIds(new Set()); setCaption(""); setJobId(null); setJobStatus("idle"); setOutputMediaId(null); setRenderError(""); draftId.current = undefined; setDraftStatus("idle"); }
  function resume(draft: StudioDraftRow) {
    try {
      const raw = JSON.parse(draft.state) as FadeDraftSnapshot & { clip?: ComposerMedia | null };
      const segments = raw.segments?.map((segment) => ({ ...segment, volume: Number.isFinite(segment.volume) ? segment.volume : 1, crops: segment.crops ?? { default: { x: 0.5, y: 0.5 } } }))
        ?? (raw.clip ? [{ id: crypto.randomUUID(), media: raw.clip, start: 0, end: null, duration: null, volume: 1, crops: { default: { x: 0.5, y: 0.5 } } }] : []);
      setResumeDraft({
        id: draft.id,
        state: {
          ...raw,
          // Drafts written before campaignName was added still have the
          // correct user-facing title, so recover it rather than showing an
          // empty required field.
          campaignName: raw.campaignName ?? (LEGACY_UNTITLED_DRAFT_TITLES.includes(draft.title) ? "" : draft.title),
          segments,
        },
        status: draft.status,
      });
      setMode("wizard");
    } catch {}
  }
  async function deleteDraft(id: string) {
    const wasCurrent = draftId.current === id;
    setDrafts((current) => current.filter((draft) => draft.id !== id));
    try {
      await fetch(`/api/app/studio/drafts/${id}`, { method: "DELETE" });
    } catch {
      /* best-effort */
    }
    if (wasCurrent) reset();
  }
  async function publishFinishedDraft(draft: StudioDraftRow) {
    try {
      const state = JSON.parse(draft.state) as FadeDraftSnapshot & { outputMediaId?: string | null };
      const mediaIds = [...new Set(Object.values(state.platformOutputMediaIds ?? {}).concat(state.outputMediaId ?? "").filter(Boolean))];
      if (mediaIds.length > 0) {
        const selectedAccountIds = new Set(state.selectedAccountIds ?? []);
        const platformIds = [...new Set(accounts.filter((account) => selectedAccountIds.has(account.id)).map((account) => account.platform))];
        const outputMetadata = Object.entries(state.platformOutputMediaIds ?? {}).map(([platformId, mediaId]) => ({
          media_id: mediaId,
          platform_id: platformId,
          aspect_ratio: fadeFormatFor(platformId, state.platformFormatIds ?? {}).aspect.name,
        }));
        const platformCaptions = Object.fromEntries(platformIds.flatMap((platformId) => {
          const text = state.platformCaptions?.[platformId]?.trim() || state.caption?.trim();
          return text ? [[platformId, text]] : [];
        }));
        const response = await fetch("/api/app/studio/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_ids: mediaIds,
            template: "fade-in",
            campaign_name: state.campaignName ?? draft.title,
            platform_ids: platformIds,
            platform_captions: platformCaptions,
            caption_brief: state.caption ?? "",
            caption_length: state.captionLength ?? "medium",
            output_metadata: outputMetadata,
          }),
        });
        if (!response.ok) throw new Error("Couldn’t prepare the finished video for publishing.");
        const params: Record<string, string> = { media: mediaIds.join(",") };
        if (state.publishDate) params.date = state.publishDate;
        if (state.publishTime) params.time = state.publishTime;
        window.location.assign(`/dashboard/create/video?${new URLSearchParams(params)}`);
      }
    } catch {
      // The draft can still be opened normally if an old/corrupt state has no render ids.
    }
  }

  if (mode === "wizard") return <FadeVideoEditor onExit={() => { setMode("choose"); void refetchDrafts(); }} accounts={accounts} initialClip={resumeDraft?.state.segments?.[0]?.media ?? clip} initialCaption={resumeDraft?.state.caption ?? caption} initialDraft={resumeDraft?.state} initialDraftId={resumeDraft?.id} initialDraftStatus={resumeDraft?.status} />;

  if (mode === "choose")
    return (
      <StudioChooseScreen
        maxW="max-w-4xl"
        icon="video"
        title="Video Editor Studio"
        cta={
          <StudioCtaCard
            title="Create a video"
            description="Build a sequence, join the clips with transitions, then review exactly what each audience will receive."
            buttonLabel="New video"
            onClick={() => { reset(); setResumeDraft(null); setMode("wizard"); }}
          />
        }
        drafts={drafts}
        draftsLoading={draftsLoading}
        renderPreview={(draft) => {
          let media: ComposerMedia | null = null;
          try {
            const state = JSON.parse(draft.state) as FadeDraftSnapshot & { clip?: ComposerMedia | null };
            media = state.segments?.[0]?.media ?? state.clip ?? null;
          } catch {}
          return media ? (
            <video src={`/api/media-file/${media.id}`} className="h-16 w-16 shrink-0 rounded-lg bg-ink object-cover" muted preload="metadata" onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(0.1, event.currentTarget.duration || 0); }} />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-deep"><Icon name="video" size={20} /></span>
          );
        }}
        onResume={resume}
        onPublish={publishFinishedDraft}
        onDelete={deleteDraft}
      />
    );
}

/* -------------------------------- jobs list -------------------------------- */

export function StudioJobsList() {
  const [jobs, setJobs] = useState<StudioJob[] | null>(null);
  const [pendingDeleteJob, setPendingDeleteJob] = useState<StudioJob | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteJob(job: StudioJob) {
    setDeletingJobId(job.id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/app/studio/jobs/${job.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? "Couldn’t delete this video.");
      setJobs((current) => current?.filter((item) => item.id !== job.id) ?? null);
      setPendingDeleteJob(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Couldn’t delete this video.");
    } finally {
      setDeletingJobId(null);
    }
  }

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch("/api/app/studio/jobs");
        const data = await res.json();
        if (stopped) return;
        const list: StudioJob[] = data.data ?? [];
        setJobs(list);
        if (list.some((j) => j.status !== "done" && j.status !== "failed")) {
          timer = setTimeout(load, 5000);
        }
      } catch {
        if (!stopped) timer = setTimeout(load, 10000);
      }
    }
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="font-bold">My videos</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <div key={job.id} className="card flex flex-col p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">{TEMPLATE_LABEL[job.template]}</p>
              <div className="flex items-center gap-2">
                <span
                  className={`pill ${
                    job.status === "done"
                      ? "bg-green-100 text-green-700"
                      : job.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-primary-soft text-primary-dark"
                  }`}
                >
                  {STATUS_LABEL[job.status]}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setPendingDeleteJob(job);
                  }}
                  aria-label={`Delete ${TEMPLATE_LABEL[job.template]}`}
                  title="Delete video"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-danger/40 hover:bg-danger/5 hover:text-danger"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {new Date(job.created_at).toLocaleString()}
            </p>
            {job.status === "done" && job.template === "slideshow" && job.output_media_ids && (
              <>
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {(JSON.parse(job.output_media_ids) as string[]).map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={id}
                      src={`/api/media-file/${id}`}
                      className="h-24 w-20 shrink-0 rounded-lg bg-page object-cover"
                      alt=""
                    />
                  ))}
                </div>
                <Link
                  href={`/dashboard/create/image?media=${(JSON.parse(job.output_media_ids) as string[]).join(",")}`}
                  className="btn-primary mt-3 !py-1.5 text-center text-sm"
                >
                  Create post
                </Link>
              </>
            )}
            {job.status === "done" && job.template !== "slideshow" && job.output_media_id && (
              <>
                <video
                  src={`/api/media-file/${job.output_media_id}`}
                  className="mt-3 max-h-64 w-full rounded-xl bg-page object-contain"
                  controls
                  muted
                />
                <Link
                  href={`/dashboard/create/video?media=${job.output_media_id}`}
                  className="btn-primary mt-3 !py-1.5 text-center text-sm"
                >
                  Create post
                </Link>
              </>
            )}
            {job.status === "failed" && (
              <p className="mt-2 text-xs text-red-600">{job.error_message}</p>
            )}
            {job.status !== "done" && job.status !== "failed" && (
              <p className="mt-2 text-xs text-muted">
                This usually takes a couple of minutes — the list refreshes itself.
              </p>
            )}
          </div>
        ))}
      </div>
      {pendingDeleteJob && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-video-title">
          <div className="card w-full max-w-md p-5 shadow-[0_24px_60px_rgba(6,63,59,0.26)]">
            <h3 id="delete-video-title" className="text-lg font-extrabold text-ink">Delete this video?</h3>
            <p className="mt-1.5 text-sm text-muted">
              This removes the video from My videos. Your source files, media library, and any existing posts will stay unchanged.
            </p>
            {deleteError && <p className="mt-3 text-sm font-semibold text-danger">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-subtle" disabled={deletingJobId !== null} onClick={() => setPendingDeleteJob(null)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" disabled={deletingJobId !== null} onClick={() => void deleteJob(pendingDeleteJob)}>
                <Icon name="trash" size={14} /> {deletingJobId === pendingDeleteJob.id ? "Deleting…" : "Delete video"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
