"use client";

// Content Studio's Thumbnail Maker: pick a background (upload / grab a frame
// from a video / generate one with AI), lay text and sticker-style cutouts on
// top, then export. Self-contained rather than sharing code with
// slideshow-studio.tsx's canvas engine (see the plan for why) — the text
// layer model, fonts, and drag/resize interaction below intentionally mirror
// that file's, so the two editors feel identical to a user even though they
// don't share code.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { Select } from "./interactive";
import { PlatformIcon } from "./platform-icon";
import { MediaLibraryModal, uploadOneFile, type ComposerMedia } from "./media";
import {
  DEFAULT_PRESET_ID,
  THUMBNAIL_ANGLES,
  THUMBNAIL_PRESETS,
  THUMBNAIL_STYLES,
  thumbnailPreset,
  type ThumbnailAngleId,
  type ThumbnailStyleId,
} from "@/lib/thumbnail-presets";
import type { ImageGenModel, ImageGenProvider } from "@/lib/image-gen";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// System font stacks only — same reasoning as slideshow-studio.tsx: nothing
// to fetch, no CSP concerns, and it matches the DOM preview to the canvas
// export exactly.
const FONTS = [
  { id: "sans", name: "Sans", stack: "-apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "serif", name: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", name: "Mono", stack: "ui-monospace, Menlo, Consolas, monospace" },
  { id: "condensed", name: "Condensed", stack: "'Arial Narrow', 'Roboto Condensed', sans-serif" },
  { id: "rounded", name: "Rounded", stack: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: "impact", name: "Impact", stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
] as const;
type FontId = (typeof FONTS)[number]["id"];

const TEXT_STYLES = [
  { id: "shadow", name: "Shadow", className: "text-white [text-shadow:0_0.06em_0_rgba(0,0,0,0.85)]", fill: "#ffffff", effect: "shadow" },
  { id: "light", name: "Light", className: "text-white", fill: "#ffffff", effect: "none" },
  { id: "dark", name: "Dark", className: "text-ink", fill: "#1c1c1e", effect: "none" },
  { id: "outline", name: "Outline", className: "text-white [text-shadow:-0.035em_-0.035em_0_#000,0.035em_-0.035em_0_#000,-0.035em_0.035em_0_#000,0.035em_0.035em_0_#000]", fill: "#ffffff", effect: "outline" },
  { id: "pop", name: "Pop", className: "text-[#ffd63b] [text-shadow:0_0.06em_0_rgba(0,0,0,0.9)]", fill: "#ffd63b", effect: "shadow" },
] as const;
type StyleId = (typeof TEXT_STYLES)[number]["id"];

// Font size is stored as a container-query width unit (cqw = 1% of the frame
// width) so it scales with the canvas — same reasoning as Slideshow Studio.
const TEXT_SIZE_PRESETS = [
  { id: "small", name: "Small", scale: 6 },
  { id: "medium", name: "Medium", scale: 9 },
  { id: "large", name: "Large", scale: 12.5 },
] as const;
const TEXT_SCALE_MIN = 4;
const TEXT_SCALE_MAX = 16;
const DEFAULT_TEXT_COLOR = "#ffffff";

const LAYER_WIDTH_MIN = 15;
const LAYER_WIDTH_MAX = 96;

type TextLayer = {
  id: string;
  kind: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  scale: number;
  font: FontId;
  style: StyleId;
  /** Text fill color, independent of `style` (which otherwise drives it) — unset falls back to the style's own default fill. */
  color?: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;
};
type StickerLayer = {
  id: string;
  kind: "sticker";
  /** Always a local blob: URL — see the background-source comment below for why nothing server-hosted gets drawn onto the canvas. */
  url: string;
  x: number;
  y: number;
  width: number;
  border: boolean;
};
type Layer = TextLayer | StickerLayer;

function layerFont(layer: TextLayer) {
  return FONTS.find((f) => f.id === layer.font) ?? FONTS[0];
}
function layerStyle(layer: TextLayer) {
  return TEXT_STYLES.find((s) => s.id === layer.style) ?? TEXT_STYLES[0];
}
function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(opacityPercent, 0, 100) / 100})`;
}
function makeTextLayer(text: string): TextLayer {
  return { id: `l_${Math.random().toString(36).slice(2, 9)}`, kind: "text", text, x: 50, y: 50, width: 70, scale: 9, font: "sans", style: "shadow", bgEnabled: false, bgColor: "#000000", bgOpacity: 100 };
}
function makeStickerLayer(url: string): StickerLayer {
  return { id: `l_${Math.random().toString(36).slice(2, 9)}`, kind: "sticker", url, x: 75, y: 75, width: 30, border: true };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Draws one text layer onto the export canvas — mirrors the DOM preview in ThumbnailLayerBox exactly. */
function drawTextLayer(ctx: CanvasRenderingContext2D, w: number, h: number, layer: TextLayer) {
  if (!layer.text.trim()) return;
  const st = layerStyle(layer);
  const font = layerFont(layer);
  const fontSize = (layer.scale / 100) * w;
  ctx.font = `900 ${fontSize}px ${font.stack}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const pad = fontSize * 0.3;
  const innerMax = (layer.width / 100) * w - pad * 2;
  const lines: string[] = [];
  for (const para of layer.text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(cand).width > innerMax) {
        lines.push(line);
        line = word;
      } else {
        line = cand;
      }
    }
    lines.push(line);
  }
  const lineHeight = fontSize * 1.25;
  const blockH = lines.length * lineHeight;
  const cx = (layer.x / 100) * w;
  const cy = (layer.y / 100) * h;
  const topY = cy - blockH / 2;

  if (layer.bgEnabled) {
    let maxLineW = 0;
    for (const ln of lines) maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
    ctx.fillStyle = hexToRgba(layer.bgColor, layer.bgOpacity);
    ctx.beginPath();
    ctx.roundRect(cx - (maxLineW + pad * 2) / 2, topY - pad * 0.2, maxLineW + pad * 2, blockH + pad * 0.4, fontSize * 0.15);
    ctx.fill();
  }

  lines.forEach((ln, i) => {
    const y = topY + i * lineHeight + lineHeight / 2;
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
}

function drawStickerLayer(ctx: CanvasRenderingContext2D, w: number, h: number, layer: StickerLayer, img: HTMLImageElement) {
  const boxW = (layer.width / 100) * w;
  const boxH = boxW * (img.height / img.width);
  const cx = (layer.x / 100) * w;
  const cy = (layer.y / 100) * h;
  if (layer.border) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = boxW * 0.05;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2 - boxW * 0.03, cy - boxH / 2 - boxW * 0.03, boxW * 1.06, boxH * 1.06, boxW * 0.04);
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(img, cx - boxW / 2, cy - boxH / 2, boxW, boxH);
}

/**
 * Rasterizes the whole thumbnail. `backgroundUrl` must be same-origin-safe
 * (a blob: URL, a data: URL, or our own /api/app/media/[id]/frame route) —
 * never a redirect to a presigned R2 URL, which has no CORS headers and
 * would taint the canvas (see lib/ffmpeg.ts's filmstrip comment for the same
 * issue on the render side). That's also why the "upload" background source
 * below is a plain file input rather than the shared media library picker.
 */
async function renderThumbnailBlob(w: number, h: number, backgroundUrl: string | null, layers: Layer[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111214";
  ctx.fillRect(0, 0, w, h);
  if (backgroundUrl) {
    try {
      const img = await loadImage(backgroundUrl);
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } catch {
      /* falls back to the solid fill above */
    }
  }
  for (const layer of layers) {
    if (layer.kind === "text") drawTextLayer(ctx, w, h, layer);
    else {
      try {
        drawStickerLayer(ctx, w, h, layer, await loadImage(layer.url));
      } catch {
        /* skip a sticker whose blob URL somehow died */
      }
    }
  }
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Render failed"))), "image/png"));
}

/** One draggable/resizable layer box in the live DOM preview — text or sticker, same interaction either way. */
function ThumbnailLayerBox({
  layer,
  frameRef,
  selected,
  onSelect,
  onChange,
  onDelete,
}: {
  layer: Layer;
  frameRef: React.RefObject<HTMLDivElement | null>;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Layer>) => void;
  onDelete: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const resizing = useRef(false);

  function onMoveDown(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect();
    const frame = frameRef.current;
    if (!frame) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = frame.getBoundingClientRect();
    grab.current = { dx: e.clientX - (r.left + (layer.x / 100) * r.width), dy: e.clientY - (r.top + (layer.y / 100) * r.height) };
  }
  function onMoveMove(e: React.PointerEvent) {
    if (!grab.current) return;
    const frame = frameRef.current;
    const box = boxRef.current;
    if (!frame || !box) return;
    const r = frame.getBoundingClientRect();
    const el = box.getBoundingClientRect();
    const halfW = (el.width / 2 / r.width) * 100;
    const halfH = (el.height / 2 / r.height) * 100;
    const x = ((e.clientX - grab.current.dx - r.left) / r.width) * 100;
    const y = ((e.clientY - grab.current.dy - r.top) / r.height) * 100;
    onChange({ x: halfW >= 50 ? 50 : clamp(x, halfW, 100 - halfW), y: halfH >= 50 ? 50 : clamp(y, halfH, 100 - halfH) });
  }
  function releasePointer(e: React.PointerEvent) {
    grab.current = null;
    resizing.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }
  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    resizing.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: React.PointerEvent) {
    if (!resizing.current) return;
    const frame = frameRef.current;
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const cx = r.left + (layer.x / 100) * r.width;
    const halfPx = Math.abs(e.clientX - cx);
    onChange({ width: clamp(((halfPx * 2) / r.width) * 100, LAYER_WIDTH_MIN, LAYER_WIDTH_MAX) });
  }

  const isText = layer.kind === "text";
  const st = isText ? layerStyle(layer) : null;
  const font = isText ? layerFont(layer) : null;

  return (
    <div
      ref={boxRef}
      style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, transform: "translate(-50%, -50%)" }}
      className={`absolute z-20 touch-none px-1 text-center ${selected ? "rounded outline outline-2 outline-primary outline-offset-2" : ""}`}
      onPointerDown={onMoveDown}
      onPointerMove={onMoveMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
    >
      {layer.kind === "text" ? (
        <div
          style={{
            fontSize: `${layer.scale}cqw`,
            fontFamily: font!.stack,
            color: layer.color || st!.fill,
            ...(layer.bgEnabled ? { backgroundColor: hexToRgba(layer.bgColor, layer.bgOpacity) } : {}),
          }}
          className={`inline-block whitespace-pre-wrap break-words rounded px-[0.3em] py-[0.12em] font-black leading-tight select-none ${st!.className} ${layer.text.trim() ? "" : "italic opacity-60"}`}
        >
          {layer.text.trim() || "Empty text layer"}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, matched to the canvas draw above.
        <img src={layer.url} alt="" draggable={false} className={`pointer-events-none w-full select-none ${layer.border ? "rounded-md border-4 border-white shadow-lg" : ""}`} />
      )}
      {selected && (
        <>
          <span
            aria-label="Drag to resize"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={releasePointer}
            onPointerCancel={releasePointer}
            className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 cursor-ew-resize touch-none rounded-full border-2 border-primary bg-white shadow"
          />
          <button
            type="button"
            aria-label="Delete layer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow"
          >
            <Icon name="x" size={11} />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The "recommended format by placement" reference card — same pattern as
 * Slideshow Studio's AspectLegendPopover (components/slideshow-studio.tsx),
 * including the portal: the canvas frame below has its own absolutely-
 * positioned layer boxes and resize handles, so an in-flow popover risks the
 * same stacking-context problem that made the original one need a portal.
 */
function ThumbnailFormatInfoPopover() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onDismiss() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [open]);

  function toggle() {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 320)) });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Recommended cover format by platform"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
          open ? "border-primary text-primary-deep" : "border-line text-muted hover:text-ink"
        }`}
      >
        <Icon name="info" size={14} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 w-[20rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line bg-white p-2 shadow-[0_18px_40px_rgba(6,63,59,0.16)]"
          >
            <p className="px-1.5 py-1 text-xs font-bold uppercase tracking-wide text-muted">Recommended cover format by placement</p>
            {THUMBNAIL_PRESETS.map((preset) => (
              <div key={preset.id} className="rounded-lg px-1.5 py-1.5 text-xs hover:bg-page/70">
                <div className="flex items-start gap-2">
                  {preset.platformId && (
                    <span className="mt-0.5 shrink-0 text-muted">
                      <PlatformIcon id={preset.platformId} size={15} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{preset.label}</span>
                    {preset.note && <span className="block text-muted">{preset.note}</span>}
                  </span>
                  <span className="shrink-0 text-right font-bold text-ink">
                    {preset.aspect}
                    <span className="block font-medium text-muted/70">{preset.hint}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

const AI_MODELS: { id: ImageGenModel; name: string; desc: string }[] = [
  { id: "nano-banana-2", name: "Nano Banana 2", desc: "Fast, reference-aware — good default" },
  { id: "gpt-image-2", name: "GPT Image 2", desc: "Best text/style control, slower" },
  { id: "seedream-5", name: "SeeDream 5", desc: "Text prompt only, no reference image" },
];

type ThumbnailStudioProps = {
  /** Whether a workspace has an AI image key on file per provider — from PROVIDERS/providerConfigured, same as Slideshow Studio's AI tab. */
  configuredProviders?: Partial<Record<ImageGenProvider, boolean>>;
};

export function ThumbnailStudio({ configuredProviders = {} }: ThumbnailStudioProps) {
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const preset = thumbnailPreset(presetId);

  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [source, setSource] = useState<"upload" | "video" | "ai">("upload");
  const uploadInput = useRef<HTMLInputElement>(null);

  // "From video" source: scrub a picked video with a plain <video> (playback
  // needs no CORS), then fetch the actual frame from our same-origin route.
  const [videoMedia, setVideoMedia] = useState<ComposerMedia | null>(null);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [frameTime, setFrameTime] = useState(0);

  // AI source
  const [subject, setSubject] = useState("");
  const [angle, setAngle] = useState<ThumbnailAngleId | "">("");
  const [style, setStyle] = useState<ThumbnailStyleId>("photo");
  const [aiModel, setAiModel] = useState<ImageGenModel>("nano-banana-2");
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advancedTextOpen, setAdvancedTextOpen] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);
  const stickerInput = useRef<HTMLInputElement>(null);

  const [exportBusy, setExportBusy] = useState<"download" | "save" | null>(null);
  const [savedMediaId, setSavedMediaId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachedTo, setAttachedTo] = useState<string | null>(null);

  useEffect(() => {
    // Revoke blob: URLs on unmount — the upload background and any sticker
    // images are the only ones that create one (AI/video sources are a data:
    // URL and a same-origin route URL, neither of which need cleanup).
    return () => {
      if (backgroundUrl?.startsWith("blob:")) URL.revokeObjectURL(backgroundUrl);
      layers.forEach((l) => l.kind === "sticker" && URL.revokeObjectURL(l.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    function onDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest("[data-keep-selection]")) return;
      setSelectedId(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selectedId]);

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  function patchLayer(id: string, patch: Partial<Layer>) {
    setLayers((current) => current.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)));
  }

  function handleUploadFile(file: File) {
    if (backgroundUrl?.startsWith("blob:")) URL.revokeObjectURL(backgroundUrl);
    setBackgroundUrl(URL.createObjectURL(file));
    setSource("upload");
    setSavedMediaId(null);
  }

  function handleStickerFile(file: File) {
    const layer = makeStickerLayer(URL.createObjectURL(file));
    setLayers((current) => [...current, layer]);
    setSelectedId(layer.id);
  }

  async function generate() {
    setAiBusy(true);
    setAiError("");
    try {
      const res = await fetch("/api/app/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          angle: angle || undefined,
          style,
          presetId,
          model: aiModel,
          references: referenceUrl ? [referenceUrl] : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't generate that image.");
      setBackgroundUrl(data.image as string);
      setSavedMediaId(null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Couldn't generate that image.");
    } finally {
      setAiBusy(false);
    }
  }

  async function exportPng(): Promise<Blob> {
    return renderThumbnailBlob(preset.w, preset.h, backgroundUrl, layers);
  }

  async function download() {
    setExportBusy("download");
    try {
      const blob = await exportPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thumbnail-${preset.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't render the thumbnail. Try again.");
    } finally {
      setExportBusy(null);
    }
  }

  async function saveToLibrary(): Promise<string | null> {
    setExportBusy("save");
    setExportError("");
    try {
      const blob = await exportPng();
      const file = new File([blob], `thumbnail-${preset.id}.png`, { type: "image/png" });
      const media = await uploadOneFile(file);
      setSavedMediaId(media.id);
      return media.id;
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Couldn't save this thumbnail.");
      return null;
    } finally {
      setExportBusy(null);
    }
  }

  async function attachTo(video: ComposerMedia) {
    setAttachOpen(false);
    const mediaId = savedMediaId ?? (await saveToLibrary());
    if (!mediaId) return;
    const res = await fetch(`/api/app/media/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnail_media_id: mediaId }),
    });
    if (res.ok) setAttachedTo(video.name);
    else setExportError("Couldn't attach the thumbnail to that video.");
  }

  const referenceCapable = aiModel !== "seedream-5";
  const aiKeyMissing = !configuredProviders[aiModel === "gpt-image-2" ? "openai" : aiModel === "seedream-5" ? "ark" : "gemini"];

  return (
    <div className="fade-up mx-auto w-full max-w-6xl pb-10">
      <div>
        <Link href="/dashboard/content-studio" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep">
          <Icon name="chevronLeft" size={15} /> Content Studio
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-contrast">
            <Icon name="image" size={18} />
          </span>
          Thumbnail Maker
        </h1>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Canvas */}
        <div className="card p-5">
          {/* One tab per cover slot, same visual pattern as Slideshow Studio's
              per-platform tabs — each preset is already a fixed aspect, so
              there's no nested format picker to open, just the tab itself. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {THUMBNAIL_PRESETS.map((p) => {
              const isActive = p.id === presetId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    isActive ? "border-primary bg-primary-soft/50 text-primary-deep" : "border-line bg-white text-muted hover:text-ink"
                  }`}
                >
                  {p.platformId ? <PlatformIcon id={p.platformId} size={14} /> : <Icon name="image" size={14} />}
                  {p.label}
                  <span className={isActive ? "text-primary-deep/70" : "text-muted/70"}>{p.aspect}</span>
                </button>
              );
            })}
            <ThumbnailFormatInfoPopover />
          </div>
          {preset.coverSupport !== "api" && <p className="mt-2 text-xs text-amber-700">{preset.note}</p>}

          <div
            ref={frameRef}
            onPointerDown={() => setSelectedId(null)}
            data-keep-selection
            className="relative mx-auto mt-4 w-full overflow-hidden rounded-xl border border-line bg-neutral-900 [container-type:inline-size]"
            style={{ aspectRatio: `${preset.w} / ${preset.h}`, maxWidth: preset.w >= preset.h ? "100%" : 360 }}
          >
            {backgroundUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500">
                <Icon name="image" size={28} />
                <p className="text-xs font-semibold">Pick a background to get started</p>
              </div>
            )}
            {layers.map((layer) => (
              <ThumbnailLayerBox
                key={layer.id}
                layer={layer}
                frameRef={frameRef}
                selected={selectedId === layer.id}
                onSelect={() => setSelectedId(layer.id)}
                onChange={(patch) => patchLayer(layer.id, patch)}
                onDelete={() => {
                  setLayers((current) => current.filter((l) => l.id !== layer.id));
                  if (layer.kind === "sticker") URL.revokeObjectURL(layer.url);
                  setSelectedId(null);
                }}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setLayers((c) => [...c, makeTextLayer("Your headline")])} className="btn-subtle">
              <Icon name="type" size={14} /> Add text
            </button>
            <button type="button" onClick={() => stickerInput.current?.click()} className="btn-subtle">
              <Icon name="upload" size={14} /> Add sticker
            </button>
            <input ref={stickerInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleStickerFile(e.target.files[0])} />
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" onClick={download} disabled={exportBusy !== null} className="btn-subtle">
                {exportBusy === "download" ? "Rendering…" : "Download"}
              </button>
              <button type="button" onClick={() => void saveToLibrary()} disabled={exportBusy !== null} className="btn-subtle">
                {exportBusy === "save" ? "Saving…" : savedMediaId ? "Saved ✓" : "Save to library"}
              </button>
              <button type="button" onClick={() => setAttachOpen(true)} disabled={exportBusy !== null} className="btn-primary">
                Attach to a video
              </button>
            </span>
          </div>
          {attachedTo && <p className="mt-2 text-xs font-semibold text-primary-deep">Set as the cover for &ldquo;{attachedTo}&rdquo;.</p>}
          {exportError && <p className="mt-2 text-xs font-semibold text-red-600">{exportError}</p>}
        </div>

        {/* Side panel */}
        <div className="card flex flex-col gap-5 p-5">
          {/* Background source */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Background</p>
            <div className="mt-2 flex gap-1 rounded-lg bg-page p-1">
              {(["upload", "video", "ai"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSource(s)} className={`flex-1 rounded-md py-1.5 text-xs font-bold ${source === s ? "bg-white shadow-sm text-ink" : "text-muted"}`}>
                  {s === "upload" ? "Upload" : s === "video" ? "From video" : "AI generate"}
                </button>
              ))}
            </div>

            {source === "upload" && (
              <div className="mt-3">
                <button type="button" onClick={() => uploadInput.current?.click()} className="btn-subtle w-full">
                  <Icon name="upload" size={14} /> Choose an image
                </button>
                <input ref={uploadInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleUploadFile(e.target.files[0])} />
              </div>
            )}

            {source === "video" && (
              <div className="mt-3 flex flex-col gap-2">
                <button type="button" onClick={() => setVideoPickerOpen(true)} className="btn-subtle w-full">
                  <Icon name="video" size={14} /> {videoMedia ? videoMedia.name : "Pick a video"}
                </button>
                {videoMedia && (
                  <>
                    {/* Hidden player, used only to learn the video's duration and to seek — never drawn to canvas. */}
                    <video
                      src={`/api/media-file/${videoMedia.id}`}
                      className="hidden"
                      onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration || 0)}
                      ref={(el) => {
                        if (el) el.currentTime = frameTime;
                      }}
                    />
                    <label className="text-xs font-semibold text-muted">
                      Frame at {frameTime.toFixed(1)}s
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0.1, videoDuration)}
                        step={0.1}
                        value={frameTime}
                        onChange={(e) => setFrameTime(Number(e.target.value))}
                        onPointerUp={(e) => {
                          setBackgroundUrl(`/api/app/media/${videoMedia.id}/frame?t=${Number((e.target as HTMLInputElement).value).toFixed(2)}`);
                          setSavedMediaId(null);
                        }}
                        className="mt-1.5 w-full accent-primary"
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            {source === "ai" && (
              <div className="mt-3 flex flex-col gap-3">
                <textarea
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What should the thumbnail show? e.g. a chef mid-flambé, flames leaping"
                  rows={3}
                  className="input resize-none"
                />
                <Select value={angle} onChange={(v) => setAngle(v as ThumbnailAngleId)} options={[{ value: "", label: "No specific angle" }, ...THUMBNAIL_ANGLES.map((a) => ({ value: a.id, label: a.label }))]} />
                <Select value={style} onChange={(v) => setStyle(v as ThumbnailStyleId)} options={THUMBNAIL_STYLES.map((s) => ({ value: s.id, label: s.label }))} />
                <Select value={aiModel} onChange={(v) => setAiModel(v as ImageGenModel)} options={AI_MODELS.map((m) => ({ value: m.id, label: m.name }))} />
                <p className="text-[11px] text-muted">{AI_MODELS.find((m) => m.id === aiModel)?.desc}</p>

                {referenceCapable && (
                  <div>
                    <button type="button" onClick={() => referenceInput.current?.click()} className="btn-subtle w-full">
                      {referenceUrl ? "Change reference photo" : "Add a reference photo (optional)"}
                    </button>
                    <input
                      ref={referenceInput}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setReferenceUrl(reader.result as string);
                        reader.readAsDataURL(file);
                      }}
                    />
                    <p className="mt-1 text-[11px] text-muted">Used for a face's likeness — e.g. a photo of yourself.</p>
                  </div>
                )}

                {aiKeyMissing ? (
                  <p className="text-xs text-amber-700">
                    Add an API key for this provider on the{" "}
                    <Link href="/dashboard/ai-image-keys" className="font-bold underline">
                      AI image keys
                    </Link>{" "}
                    page first.
                  </p>
                ) : (
                  <button type="button" onClick={() => void generate()} disabled={aiBusy || !subject.trim()} className="btn-primary w-full">
                    {aiBusy ? "Generating…" : "Generate background"}
                  </button>
                )}
                {aiError && <p className="text-xs font-semibold text-red-600">{aiError}</p>}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Advanced text settings — full-width so Font/Size/Style/Color/Background
          can sit side by side, matching Slideshow Studio's layout exactly. */}
      <div className="card mt-5 p-5">
        <button
          type="button"
          onClick={() => setAdvancedTextOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-bold text-muted transition-colors hover:text-primary-deep"
        >
          <Icon name="gear" size={16} />
          Advanced Text Settings
          <Icon name={advancedTextOpen ? "chevronUp" : "chevronDown"} size={15} />
        </button>

        {advancedTextOpen && selected?.kind === "text" && (
          <div data-keep-selection className="mt-4">
            <textarea
              value={selected.text}
              onChange={(e) => patchLayer(selected.id, { text: e.target.value.slice(0, 80) })}
              rows={2}
              className="input resize-none"
              placeholder="Keep it under ~4 words for the biggest CTR lift"
            />
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-5 rounded-xl border border-line bg-page/50 p-4">
              <div className="min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Font</p>
                <div className="flex flex-wrap gap-1">
                  {FONTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => patchLayer(selected.id, { font: f.id })}
                      style={{ fontFamily: f.stack }}
                      className={`rounded-lg px-2.5 py-1.5 text-sm font-bold transition-colors ${
                        selected.font === f.id ? "border border-primary bg-white text-primary-deep" : "border border-transparent text-muted hover:text-ink"
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Font Size</p>
                <div className="flex flex-wrap gap-1">
                  {TEXT_SIZE_PRESETS.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => patchLayer(selected.id, { scale: size.scale })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                        selected.scale === size.scale ? "border border-primary bg-white text-primary-deep" : "border border-transparent text-muted hover:text-ink"
                      }`}
                    >
                      {size.name}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={TEXT_SCALE_MIN}
                  max={TEXT_SCALE_MAX}
                  step={0.5}
                  value={selected.scale}
                  onChange={(e) => patchLayer(selected.id, { scale: Number(e.target.value) })}
                  aria-label="Font size"
                  className="mt-3 w-full cursor-pointer accent-primary"
                />
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-muted">
                  Size
                  <span className="flex items-center rounded-lg border border-line bg-white px-2 py-1">
                    <input
                      type="number"
                      min={TEXT_SCALE_MIN}
                      max={TEXT_SCALE_MAX}
                      step={0.5}
                      value={selected.scale}
                      onChange={(e) => patchLayer(selected.id, { scale: clamp(Number(e.target.value), TEXT_SCALE_MIN, TEXT_SCALE_MAX) })}
                      className="w-14 bg-transparent text-right font-mono text-xs font-bold text-ink outline-none"
                      aria-label="Font size value"
                    />
                    <span className="ml-1 font-mono text-muted/70">cqw</span>
                  </span>
                </label>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Style</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {TEXT_STYLES.map((styleOpt) => (
                    <button
                      key={styleOpt.id}
                      type="button"
                      onClick={() => patchLayer(selected.id, { style: styleOpt.id })}
                      aria-pressed={selected.style === styleOpt.id}
                      className={`flex h-12 items-center justify-center rounded-lg border p-1.5 transition-colors ${
                        selected.style === styleOpt.id ? "border-primary ring-2 ring-primary/30" : "border-line hover:border-primary/50"
                      }`}
                      title={styleOpt.name}
                    >
                      <span className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-slate-300 via-slate-400 to-slate-600">
                        <span
                          className={`rounded px-1.5 py-0.5 text-sm font-black ${styleOpt.className}`}
                          style={{
                            color: selected.color || styleOpt.fill,
                            ...(selected.bgEnabled ? { backgroundColor: hexToRgba(selected.bgColor, selected.bgOpacity) } : {}),
                          }}
                        >
                          Aa
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Font Color</p>
                <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1">
                  <input
                    type="color"
                    value={selected.color || DEFAULT_TEXT_COLOR}
                    onChange={(e) => patchLayer(selected.id, { color: e.target.value })}
                    className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Font color"
                  />
                  <input
                    type="text"
                    value={selected.color || DEFAULT_TEXT_COLOR}
                    onChange={(e) => patchLayer(selected.id, { color: e.target.value })}
                    className="w-full min-w-0 bg-transparent font-mono text-xs font-bold text-ink outline-none"
                    aria-label="Font color hex code"
                    spellCheck={false}
                  />
                </label>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Text Background</p>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => patchLayer(selected.id, { bgEnabled: false })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                      !selected.bgEnabled ? "border border-primary bg-white text-primary-deep" : "border border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    None
                  </button>
                  <button
                    type="button"
                    onClick={() => patchLayer(selected.id, { bgEnabled: true })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                      selected.bgEnabled ? "border border-primary bg-white text-primary-deep" : "border border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    Color
                  </button>
                  {selected.bgEnabled && (
                    <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1">
                      <input
                        type="color"
                        value={selected.bgColor}
                        onChange={(e) => patchLayer(selected.id, { bgColor: e.target.value })}
                        className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                        aria-label="Text background color"
                      />
                      <input
                        type="text"
                        value={selected.bgColor}
                        onChange={(e) => patchLayer(selected.id, { bgColor: e.target.value })}
                        className="w-20 min-w-0 bg-transparent font-mono text-xs font-bold text-ink outline-none"
                        aria-label="Text background color hex code"
                        spellCheck={false}
                      />
                    </label>
                  )}
                </div>
                {selected.bgEnabled && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-muted">Opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={selected.bgOpacity}
                      onChange={(e) => patchLayer(selected.id, { bgOpacity: Number(e.target.value) })}
                      aria-label="Background opacity"
                      className="min-w-24 flex-1 cursor-pointer accent-primary"
                    />
                    <span className="flex shrink-0 items-center rounded-lg border border-line bg-white px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={selected.bgOpacity}
                        onChange={(e) => patchLayer(selected.id, { bgOpacity: Math.round(clamp(Number(e.target.value), 0, 100)) })}
                        className="w-10 bg-transparent text-right font-mono text-xs font-bold text-ink outline-none"
                        aria-label="Background opacity value"
                      />
                      <span className="ml-1 font-mono text-xs text-muted/70">%</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {advancedTextOpen && selected?.kind === "sticker" && (
          <div data-keep-selection className="mt-4 rounded-xl border border-line bg-page/50 p-4">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <input type="checkbox" checked={selected.border} onChange={(e) => patchLayer(selected.id, { border: e.target.checked })} /> White sticker border
            </label>
          </div>
        )}

        {advancedTextOpen && !selected && (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-page/50 p-6 text-center text-sm font-semibold text-muted">
            Click a text or sticker layer on the thumbnail to style it here.
          </div>
        )}
      </div>

      {videoPickerOpen && (
        <MediaLibraryModal
          kind="video"
          onClose={() => setVideoPickerOpen(false)}
          onPick={(m) => {
            setVideoMedia(m);
            setFrameTime(0);
            setVideoPickerOpen(false);
          }}
        />
      )}
      {attachOpen && (
        <MediaLibraryModal kind="video" onClose={() => setAttachOpen(false)} onPick={(m) => void attachTo(m)} />
      )}
    </div>
  );
}
