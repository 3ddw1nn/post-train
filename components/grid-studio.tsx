"use client";

// Full 2x2 Grid Video studio, mirroring Slideshow Studio's shape: a choose
// screen with resumable Drafts, then a three-step wizard — Build (campaign,
// publishing, post-to accounts, composition, and render), Captions (with a
// rendered-video preview), and Review & Summary. Audio can mix any subset of
// clips plus an uploaded track; optional colored separators sit between
// quadrants. Renders go through /api/app/studio/jobs (ffmpeg); clips/audio/
// output all live in the shared media pipeline (R2 when configured). The
// last step's Finish button marks the render as a Library item; Publish
// then hands it to Create Post 2.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./icons";
import { PlatformIcon, AccountAvatar } from "./platform-icon";
import { MediaLibraryModal, uploadOneFile, type ComposerMedia } from "./media";
import { platform as platformOf, CAPTION_MAX, CAPTION_MAX_BY_PLATFORM } from "@/lib/platforms";
import {
  VIDEO_FPS_OPTIONS,
  VIDEO_PRESETS,
  VIDEO_ASPECTS,
  normalizeVideoFps,
  videoPresetById,
  videoPresetForLegacyPlatform,
  type VideoFps,
  type VideoPresetId,
  type VideoAspectId,
  type VideoAspect,
} from "@/lib/video-render-settings";
import { checkAiTone, type AiToneResult } from "@/lib/ai-tone";
import type { StudioDraftRow } from "@/lib/studio-drafts";
import { localDateInputValue, nextMinuteInputValue, isPastSchedule } from "@/lib/format";
import { StudioChooseScreen, StudioCtaCard } from "./studio-choose-screen";
import { useEditGuard } from "./edit-guard";
import { CaptionCopyButton } from "./caption-copy-button";

export type GridAccount = { id: number; platform: string; username: string; avatar_url: string | null };
type JobStatus = "idle" | "queued" | "generating" | "compositing" | "done" | "failed";
type CropOffset = { x: number; y: number };
const DEFAULT_CROP: CropOffset = { x: 0.5, y: 0.5 };
const DEFAULT_CROP_SET: CropOffset[] = [DEFAULT_CROP, DEFAULT_CROP, DEFAULT_CROP, DEFAULT_CROP];
// Keyed by platform tab id ("default" when no tab is active) — each tab
// crops to its own aspect ratio, so a quadrant's focal point for TikTok's
// 9:16 has no business carrying over to Instagram Feed's 4:5.
type CropOffsetMap = Record<string, CropOffset[]>;
type GridDraftSnapshot = Partial<{
  step: number;
  clips: (ComposerMedia | null)[];
  audioClips: number[];
  audioTrack: ComposerMedia | null;
  borderOn: boolean;
  borderColor: string;
  borderWidth: number;
  borderOpacity: number;
  cropOffsets: CropOffsetMap;
  trimStart: number;
  trimEnd: number | null;
  activePresetId: VideoPresetId;
  activePlatform: string;
  fps: number;
  campaignName: string;
  publishDate: string;
  publishTime: string;
  selectedAccountIds: number[];
  description: string;
  captionLength: "short" | "medium" | "long";
  platformCaptions: Record<string, string>;
  jobId: string | null;
  jobIds: Record<string, string>;
  jobStatus: JobStatus;
  outputMediaId: string | null;
  platformOutputMediaIds: Record<string, string>;
  renderSignatures: Record<string, string>;
  pendingRenderSignatures: Record<string, string>;
  platformVideoFormatIds: Record<string, string>;
}>;

const STEPS = ["Build", "Captions", "Review & Summary"] as const;
const CELLS = [{ label: "Top left" }, { label: "Top right" }, { label: "Bottom left" }, { label: "Bottom right" }] as const;
const BORDER_MIN = 1;
const BORDER_MAX = 40;
const CAPTION_LENGTHS = [
  ["short", "Short"],
  ["medium", "Medium"],
  ["long", "Long"],
] as const;
const DEFAULT_VIDEO_PRESET: VideoPresetId = "vertical-short";

const STATUS_LABEL: Record<Exclude<JobStatus, "idle">, string> = {
  queued: "Queued…",
  generating: "Generating…",
  compositing: "Rendering…",
  done: "Ready",
  failed: "Failed",
};

/* ---------------------------- video format helpers --------------------------- */

type VideoFormatOption = {
  id: string;
  label: string;
  presetId: VideoPresetId;
  presetName: string;
  placement: string;
  aspect: VideoAspect;
};

// All unique platform IDs referenced by any video preset, serving as tabs.
const VIDEO_PREVIEW_PLATFORM_TABS = Array.from(
  new Set(VIDEO_PRESETS.flatMap((preset) => preset.targets.map((target) => target.platformId))),
);

function videoFormatOptionsForPlatform(platformId: string): VideoFormatOption[] {
  return VIDEO_PRESETS.flatMap((preset) =>
    preset.targets
      .filter((target) => target.platformId === platformId)
      .map((target) => ({
        id: `${preset.id}:${target.label}`,
        label: target.label,
        presetId: preset.id,
        presetName: preset.name,
        placement: preset.placement,
        aspect: preset.aspect,
      })),
  );
}

function defaultVideoFormatForPlatform(platformId: string): VideoFormatOption {
  const options = videoFormatOptionsForPlatform(platformId);
  // Prefer 9:16 (vertical short) as the default for most video platforms.
  return options.find((o) => o.aspect.id === "9:16") ?? options[0] ?? {
    id: `${platformId}:default`,
    label: platformOf(platformId)?.name ?? platformId,
    presetId: DEFAULT_VIDEO_PRESET,
    presetName: "Default",
    placement: "Recommended video format",
    aspect: VIDEO_ASPECTS[0],
  };
}

function selectedVideoFormatForPlatform(platformId: string, selected: Record<string, string>): VideoFormatOption {
  const options = videoFormatOptionsForPlatform(platformId);
  return options.find((option) => option.id === selected[platformId]) ?? defaultVideoFormatForPlatform(platformId);
}

/* --------------------------------- helpers -------------------------------- */

function audioSummary(clips: number[], hasTrack: boolean): string {
  const nums = [...clips].sort((a, b) => a - b).map((i) => i + 1);
  const parts: string[] = [];
  if (nums.length === 1) parts.push(`clip ${nums[0]}`);
  else if (nums.length > 1) parts.push(`clips ${nums.join(", ")}`);
  if (hasTrack) parts.push("your track");
  if (parts.length === 0) return "Silent — no audio will play.";
  if (parts.length === 1 && nums.length <= 1 && !hasTrack) return `Plays ${parts[0]}'s sound; the rest are muted.`;
  return `Mixing ${parts.join(" + ")} together.`;
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function FieldLabel({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-muted">
      {icon && <Icon name={icon} size={14} />}
      {children}
    </p>
  );
}

function Stepper({
  steps,
  current,
  onNavigate,
}: {
  steps: readonly string[];
  current: number;
  onNavigate: (step: number) => void;
}) {
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => onNavigate(i)}
              aria-current={active ? "step" : undefined}
              aria-label={`Go to step ${i + 1}: ${label}`}
              className="group flex min-h-11 min-w-11 flex-col items-center gap-2 rounded-lg px-1 outline-none transition-colors hover:text-primary-deep focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black transition-colors group-hover:border-primary ${
                  done
                    ? "border-primary bg-primary text-white"
                    : active
                      ? "border-primary bg-primary-soft text-primary-deep ring-4 ring-primary-soft/70"
                      : "border-line bg-white text-muted"
                }`}
              >
                {done ? <Icon name="check" size={17} /> : i + 1}
              </span>
              <span className={`text-xs font-black uppercase tracking-[0.12em] transition-colors group-hover:text-primary-deep ${active ? "text-primary-deep" : done ? "text-ink" : "text-muted"}`}>
                {label}
              </span>
            </button>
            {i < steps.length - 1 && <span className={`mx-4 mb-8 h-0.5 flex-1 rounded-full sm:mx-8 ${done ? "bg-primary" : "bg-line"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return ref;
}

function Popover({
  trigger,
  children,
  up = false,
  align = "left",
  width = "min-w-[15rem]",
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  up?: boolean;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="block w-full text-left">
        {trigger(open)}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-50 ${width} overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-[0_18px_40px_rgba(6,63,59,0.16)] ${
            up ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"
          } ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={Boolean(active)}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        active ? "bg-primary-soft text-primary-deep" : "text-ink hover:bg-page"
      }`}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({ title, message, onCancel, onConfirm }: { title: string; message: string; onCancel: () => void; onConfirm: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">{title}</p>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-subtle" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Repositions a clip's focal point within its quadrant. The crop window's
// size (relative to the video's own frame) mirrors exactly how the render
// crops it (lib/ffmpeg.ts gridScaleFilter): whichever axis has excess after
// scaling to fill is the one the user can drag; the other is locked at 100%.
function CropModal({
  media,
  targetAspect,
  initial,
  progressLabel,
  actionLabel = "Save",
  onCancel,
  onSave,
}: {
  media: ComposerMedia;
  targetAspect: number;
  initial: CropOffset;
  progressLabel?: string;
  actionLabel?: string;
  onCancel: () => void;
  onSave: (offset: CropOffset) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(initial);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ clientX: number; clientY: number; t: number } | null>(null);
  useEffect(() => setMounted(true), []);

  const videoAspect = videoSize ? videoSize.w / videoSize.h : targetAspect;
  let cropWidthPct = 100;
  let cropHeightPct = 100;
  let axis: "x" | "y" | "none" = "none";
  if (videoAspect > targetAspect + 0.005) {
    cropWidthPct = (targetAspect / videoAspect) * 100;
    axis = "x";
  } else if (videoAspect < targetAspect - 0.005) {
    cropHeightPct = (videoAspect / targetAspect) * 100;
    axis = "y";
  }
  const cropLeftPct = axis === "x" ? (100 - cropWidthPct) * pos.x : 0;
  const cropTopPct = axis === "y" ? (100 - cropHeightPct) * pos.y : 0;

  const maxBoxWidth = 560;
  const maxBoxHeight = 460;
  let boxWidth = maxBoxWidth;
  let boxHeight = boxWidth / videoAspect;
  if (boxHeight > maxBoxHeight) {
    boxHeight = maxBoxHeight;
    boxWidth = boxHeight * videoAspect;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (axis === "none") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { clientX: e.clientX, clientY: e.clientY, t: axis === "x" ? pos.x : pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || axis === "none" || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (axis === "x") {
      const usable = rect.width * (1 - cropWidthPct / 100);
      if (usable <= 0) return;
      const t = Math.min(1, Math.max(0, dragRef.current.t + (e.clientX - dragRef.current.clientX) / usable));
      setPos((p) => ({ ...p, x: t }));
    } else {
      const usable = rect.height * (1 - cropHeightPct / 100);
      if (usable <= 0) return;
      const t = Math.min(1, Math.max(0, dragRef.current.t + (e.clientY - dragRef.current.clientY) / usable));
      setPos((p) => ({ ...p, y: t }));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-extrabold">Reposition crop</p>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-muted hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {progressLabel ? `${progressLabel} · ` : ""}
          {axis === "none"
            ? "This clip already fills the frame exactly — nothing to drag."
            : "Drag the highlighted box to choose what stays in view."}
        </p>

        <div className="mt-4 flex justify-center">
          <div
            ref={containerRef}
            className="relative touch-none select-none overflow-hidden rounded-xl bg-ink"
            style={{ width: boxWidth, height: boxHeight }}
          >
            <video
              src={`/api/media-file/${media.id}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
              autoPlay
              loop
              muted
              playsInline
              onLoadedMetadata={(e) => setVideoSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
            />
            {axis !== "none" && (
              <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="absolute border-2 border-white"
                style={{
                  left: `${cropLeftPct}%`,
                  top: `${cropTopPct}%`,
                  width: `${cropWidthPct}%`,
                  height: `${cropHeightPct}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
                  cursor: axis === "x" ? "ew-resize" : "ns-resize",
                }}
              />
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-subtle" onClick={() => setPos(DEFAULT_CROP)}>
            <Icon name="refresh" size={14} /> Center
          </button>
          <button type="button" className="btn-subtle" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => onSave(pos)}>
            <Icon name={actionLabel === "Save" ? "check" : "chevronRight"} size={15} /> {actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AddButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white/95 px-2 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-primary-soft"
    >
      <Icon name={icon} size={13} /> {label}
    </button>
  );
}

function AudioChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
        active ? "border-primary bg-primary-soft text-primary-deep" : "border-line bg-white text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function SliderRow({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-xs font-semibold text-ink">
      <span className="w-14 shrink-0 text-muted">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-primary" />
      <span className="flex w-20 shrink-0 items-center justify-end gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
          aria-label={label}
          className="w-14 rounded-md border border-line bg-white px-1.5 py-0.5 text-right tabular-nums text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary/25"
        />
        <span className="shrink-0 text-muted">{suffix}</span>
      </span>
    </label>
  );
}

function HexColorInput({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState(false);
  useEffect(() => {
    setText(value);
    setError(false);
  }, [value]);
  function commit() {
    const raw = text.trim();
    const withHash = raw.startsWith("#") ? raw : `#${raw}`;
    // Must match the renderer's own validation (lib/ffmpeg.ts) — it only
    // accepts 6-digit hex and silently falls back to white otherwise, so a
    // shorthand 3-digit hex here would look right in preview but render white.
    if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
      setError(false);
      onChange(withHash.toLowerCase());
    } else {
      setError(true);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="#ffffff"
        maxLength={7}
        aria-label="Border color hex code"
        className={`w-24 rounded-md border bg-white px-2 py-1 font-mono text-xs uppercase text-ink outline-none focus:ring-1 ${
          error ? "border-danger focus:border-danger focus:ring-danger/25" : "border-line focus:border-primary focus:ring-primary/25"
        }`}
      />
      {error && <span className="text-[11px] font-semibold text-danger">Invalid hex color</span>}
    </div>
  );
}

function AspectLegendPopover() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function toggle() {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 360)) });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
          open ? "border-primary text-primary-deep" : "border-line text-muted hover:text-ink"
        }`}
        aria-label="Show video format guide"
      >
        <Icon name="info" size={15} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-40 w-[22rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line bg-white p-2 shadow-[0_18px_40px_rgba(6,63,59,0.16)]"
          >
            <p className="px-1.5 py-1 text-xs font-bold uppercase tracking-wide text-muted">Recommended video format by placement</p>
            {VIDEO_PRESETS.map((preset) => (
              <div key={preset.id} className="rounded-lg px-1.5 py-1.5 text-xs hover:bg-page/70">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{preset.name}</span>
                    <span className="block text-muted">{preset.placement}</span>
                  </span>
                  <span className="shrink-0 text-right font-bold text-ink">
                    {preset.aspect.name}
                    <span className="block font-medium text-muted/70">{preset.aspect.px}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {preset.targets.map((target) => (
                    <span
                      key={`${preset.id}-${target.label}`}
                      title={target.label}
                      aria-label={target.label}
                      className="inline-flex items-center text-muted"
                    >
                      <PlatformIcon id={target.platformId} size={17} />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

function Cell({
  index,
  media,
  isAudio,
  busy,
  error,
  onUpload,
  onLibrary,
  onRemove,
  videoRef,
  onLoadedMetadata,
  onTimeUpdate,
  onEnded,
  cropOffset,
  onReposition,
  hideOverlays,
}: {
  index: number;
  media: ComposerMedia | null;
  isAudio: boolean;
  busy: boolean;
  error: string | null;
  onUpload: () => void;
  onLibrary: () => void;
  onRemove: () => void;
  videoRef?: (el: HTMLVideoElement | null) => void;
  onLoadedMetadata?: (duration: number) => void;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
  cropOffset: CropOffset;
  onReposition: () => void;
  hideOverlays: boolean;
}) {
  const cell = CELLS[index];
  return (
    <div className={`group relative overflow-hidden ${media ? "bg-ink" : "bg-white hover:bg-primary-soft/30"}`}>
      {!hideOverlays && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex items-center gap-1">
          <span className={`flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-black ${media ? "bg-black/55 text-white" : "bg-page text-muted"}`}>
            {index + 1}
          </span>
          {isAudio && (
            <span className="flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
              <Icon name="audio" size={10} /> Audio
            </span>
          )}
        </div>
      )}

      {media ? (
        <>
          <video
            key={media.id}
            ref={videoRef}
            src={`/api/media-file/${media.id}`}
            className="fade-up absolute inset-0 h-full w-full cursor-pointer object-cover"
            style={{ objectPosition: `${cropOffset.x * 100}% ${cropOffset.y * 100}%` }}
            muted={!isAudio}
            playsInline
            preload="metadata"
            title="Double-click to reposition crop"
            onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration)}
            onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
            onEnded={onEnded}
            onDoubleClick={onReposition}
          />
          {!hideOverlays && (
            <>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${cell.label} clip`}
                className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-80 transition hover:bg-black/80 hover:opacity-100"
              >
                <Icon name="x" size={13} />
              </button>
              <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">{media.name}</span>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={onUpload} className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white transition hover:bg-white/25">
                    Replace
                  </button>
                  <button type="button" onClick={onLibrary} className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white transition hover:bg-white/25">
                    Library
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-2.5">
          {busy ? (
            <>
              <span className="skeleton-shimmer h-9 w-9 rounded-full" />
              <p className="text-xs font-semibold text-muted">Uploading…</p>
            </>
          ) : (
            <>
              <span className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">{cell.label}</span>
              <div className="flex w-full max-w-[8.5rem] flex-col gap-1.5">
                <AddButton icon="upload" label="Upload" onClick={onUpload} />
                <AddButton icon="image" label="Library" onClick={onLibrary} />
              </div>
              {error && <p className="mt-0.5 text-center text-[11px] font-semibold text-danger">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DraftPreview({ draft }: { draft: StudioDraftRow }) {
  let firstClip: ComposerMedia | null = null;
  try {
    const snapshot = JSON.parse(draft.state) as GridDraftSnapshot;
    firstClip = snapshot.clips?.find((clip): clip is ComposerMedia => clip !== null) ?? null;
  } catch {
    // Older or malformed drafts still get the stable grid fallback.
  }

  if (!firstClip) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
        <Icon name="grid" size={22} />
      </span>
    );
  }

  return firstClip.kind === "video" ? (
    <video
      src={`/api/media-file/${firstClip.id}`}
      aria-label={`First clip: ${firstClip.name}`}
      className="h-16 w-16 shrink-0 rounded-lg bg-ink object-cover"
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={(event) => {
        // Browsers otherwise frequently paint black for a paused video with
        // no poster. Seeking a fraction in draws a usable first-clip frame.
        event.currentTarget.currentTime = Math.min(0.1, event.currentTarget.duration || 0);
      }}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/media-file/${firstClip.id}`} alt={`First clip: ${firstClip.name}`} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
  );
}


/* ---------------------------------- main ---------------------------------- */

export function GridStudio({ accounts = [] }: { accounts?: GridAccount[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "wizard">("choose");
  const [step, setStep] = useState(0);

  // Build
  const [clips, setClips] = useState<(ComposerMedia | null)[]>([null, null, null, null]);
  const [busyCells, setBusyCells] = useState<Record<number, boolean>>({});
  const [cellErrors, setCellErrors] = useState<Record<number, string>>({});
  const [libTarget, setLibTarget] = useState<number | null>(null);
  const [audioClips, setAudioClips] = useState<number[]>([0]);
  const [audioTrack, setAudioTrack] = useState<ComposerMedia | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [audioLibOpen, setAudioLibOpen] = useState(false);
  const [borderOn, setBorderOn] = useState(false);
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [borderWidth, setBorderWidth] = useState(2);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [clipDurations, setClipDurations] = useState<(number | null)[]>([null, null, null, null]);
  const clipVideoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);
  const [borderOpacity, setBorderOpacity] = useState(100);
  const [activePresetId, setActivePresetId] = useState<VideoPresetId>(DEFAULT_VIDEO_PRESET);
  const [fps, setFps] = useState<VideoFps>(60);
  const [previewPlatform, setPreviewPlatform] = useState<string>("");
  const [platformVideoFormatIds, setPlatformVideoFormatIds] = useState<Record<string, string>>({});
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [hideOverlays, setHideOverlays] = useState(false);
  const [cropOffsets, setCropOffsets] = useState<CropOffsetMap>({});
  const [cropFlow, setCropFlow] = useState<{ index: number; keys: string[]; current: number } | null>(null);
  // Trims the composed timeline as a whole (all four clips together), not
  // any one quadrant — trimEnd null means "through the natural end".
  const [trimStart, setTrimStartRaw] = useState(0);
  const [trimEnd, setTrimEndRaw] = useState<number | null>(null);

  // Render
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobIds, setJobIds] = useState<Record<string, string>>({});
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [outputMediaId, setOutputMediaId] = useState<string | null>(null);
  const [platformOutputMediaIds, setPlatformOutputMediaIds] = useState<Record<string, string>>({});
  // The exact Build inputs used for the latest completed output per platform.
  // It lets a one-platform crop/format adjustment render only that platform.
  const [renderSignatures, setRenderSignatures] = useState<Record<string, string>>({});
  const [pendingRenderSignatures, setPendingRenderSignatures] = useState<Record<string, string>>({});
  const [platformRenderStatuses, setPlatformRenderStatuses] = useState<Record<string, JobStatus>>({});
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [renderElapsedSeconds, setRenderElapsedSeconds] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pollNonce, setPollNonce] = useState(0);

  // Launch
  const [campaignName, setCampaignName] = useState("");
  const [publishDate, setPublishDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [publishTime, setPublishTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const earliestPublishDate = localDateInputValue();
  const earliestPublishTime = nextMinuteInputValue();
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
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [description, setDescription] = useState("");
  const [captionLength, setCaptionLength] = useState<"short" | "medium" | "long">("medium");
  const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>({});
  const [captionBusy, setCaptionBusy] = useState<Record<string, boolean>>({});
  const [captionError, setCaptionError] = useState<Record<string, string>>({});
  const [toneResults, setToneResults] = useState<Record<string, AiToneResult>>({});
  const [improveBusy, setImproveBusy] = useState<Record<string, boolean>>({});

  // Finish / Publish
  const [finishing, setFinishing] = useState(false);
  const [finishedMediaId, setFinishedMediaId] = useState<string | null>(null);
  const [draftLocked, setDraftLocked] = useState(false);
  const publishScheduleIsPast = !draftLocked && isPastSchedule(publishDate, publishTime);
  async function finish() {
    if (!outputMediaId || finishing) return;
    setFinishing(true);
    try {
      const res = await fetch("/api/app/studio/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_ids: [outputMediaId], template: "grid-2x2", campaign_name: campaignName, platform_ids: [...selectedPlatforms], platform_captions: Object.fromEntries(Object.entries(platformCaptions).filter(([id]) => selectedPlatforms.has(id))) }),
      });
      if (res.ok) {
        setFinishedMediaId(outputMediaId);
        if (draftIdRef.current) {
          const id = draftIdRef.current;
          await fetch(`/api/app/studio/drafts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "finished" }),
          }).catch(() => {});
          setDrafts((current) => current.map((d) => (d.id === id ? { ...d, status: "finished" } : d)));
        }
      }
    } finally {
      setFinishing(false);
    }
  }
  async function unlockDraft() {
    setDraftLocked(false);
    if (draftIdRef.current) {
      const id = draftIdRef.current;
      await fetch(`/api/app/studio/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "drafting" }),
      }).catch(() => {});
      setDrafts((current) => current.map((d) => (d.id === id ? { ...d, status: "drafting" } : d)));
    }
  }
  const editGuard = useEditGuard(draftLocked, () => void unlockDraft());

  // Drafts
  const [drafts, setDrafts] = useState<StudioDraftRow[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const draftIdRef = useRef<string | undefined>(undefined);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const clipInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<number>(0);

  const filled = clips.filter(Boolean).length;
  const rendering = jobStatus === "queued" || jobStatus === "generating" || jobStatus === "compositing";
  // ponytail: progress bar tracks whichever filled clip loads metadata first,
  // not necessarily the shortest — good enough for a scrub preview since the
  // clips only drift a frame or two; the real render still trims to shortest.
  const driverIndex = clips.findIndex((m) => m !== null);
  const knownDurations = clipDurations.filter((d): d is number => d != null);
  const previewDuration = knownDurations.length > 0 ? Math.min(...knownDurations) : 0;
  // Whole seconds — plenty precise for trimming a short-form clip, and keeps
  // the slider/number pair (which step by 1) always in sync with the state.
  const maxTrimSeconds = Math.max(0, Math.floor(previewDuration));
  const clampedTrimStart = Math.max(0, Math.min(Math.round(trimStart), maxTrimSeconds));
  const effectiveTrimEnd = trimEnd !== null ? Math.max(clampedTrimStart, Math.min(Math.round(trimEnd), maxTrimSeconds)) : maxTrimSeconds;
  function setTrimStart(value: number) {
    setTrimStartRaw(Math.max(0, Math.min(Math.round(value), effectiveTrimEnd)));
  }
  function setTrimEnd(value: number) {
    const rounded = Math.round(value);
    if (rounded >= maxTrimSeconds) {
      setTrimEndRaw(null); // back at the natural end — nothing left to carry
      return;
    }
    setTrimEndRaw(Math.max(clampedTrimStart, rounded));
  }
  function resetTrim() {
    setTrimStartRaw(0);
    setTrimEndRaw(null);
  }
  const activePreset = videoPresetById(activePresetId) ?? VIDEO_PRESETS[0];
  const activeAspect = activePreset.aspect;

  const selectedPlatforms = new Set(
    [...selectedAccountIds].map((id) => accounts.find((a) => a.id === id)?.platform).filter((p): p is string => !!p)
  );

  // Only the platforms actually selected under Post To get a format tab;
  // with none selected there's nothing to show and we fall back to the
  // default preset's aspect ratio below.
  const visiblePlatformTabs = VIDEO_PREVIEW_PLATFORM_TABS.filter((pid) => selectedPlatforms.has(pid));
  const slidesActiveTab = (visiblePlatformTabs as readonly string[]).includes(previewPlatform) ? previewPlatform : visiblePlatformTabs[0];
  const slidesActiveFormat = slidesActiveTab ? selectedVideoFormatForPlatform(slidesActiveTab, platformVideoFormatIds) : null;
  const slidesActiveAspect = slidesActiveFormat?.aspect.id ?? activeAspect.id;
  const slidesActiveAspectInfo = VIDEO_ASPECTS.find((a) => a.id === slidesActiveAspect) ?? activeAspect;
  // The preset that actually matches what's shown/selected right now — the
  // tab's own preset when a platform format is picked, else the plain
  // default. Render must use this, not activePreset, or the video gets
  // rendered at a different aspect than what the crop reposition showed.
  const effectivePreset = (slidesActiveFormat && videoPresetById(slidesActiveFormat.presetId)) || activePreset;

  // Which crop bucket is live right now — one crop set per platform tab (each
  // tab crops to its own aspect ratio), "default" when no accounts/tabs are
  // selected yet.
  const cropKey = slidesActiveTab || "default";
  const activeCropOffsets = cropOffsets[cropKey] ?? DEFAULT_CROP_SET;
  const cropFlowKey = cropFlow?.keys[cropFlow.current] ?? cropKey;
  const cropFlowFormat = cropFlowKey !== "default" ? selectedVideoFormatForPlatform(cropFlowKey, platformVideoFormatIds) : null;
  const cropFlowAspect = cropFlowFormat?.aspect ?? activeAspect;
  const renderPlatforms = visiblePlatformTabs.length > 0 ? visiblePlatformTabs : ["default"];
  function renderSignatureFor(platformId: string) {
    const format = platformId === "default" ? null : selectedVideoFormatForPlatform(platformId, platformVideoFormatIds);
    const preset = format ? videoPresetById(format.presetId) ?? activePreset : effectivePreset;
    return JSON.stringify({
      clips: clips.map((clip) => clip?.id ?? null),
      preset: preset.id,
      aspect: (format?.aspect ?? slidesActiveAspectInfo).id,
      fps,
      audioClips: [...audioClips].sort((a, b) => a - b),
      audioTrack: audioTrack?.id ?? null,
      border: borderOn ? { color: borderColor, width: borderWidth, opacity: borderOpacity } : null,
      crop: cropOffsets[platformId] ?? DEFAULT_CROP_SET,
    });
  }
  const dirtyRenderPlatforms = renderPlatforms.filter(
    (platformId) => !platformOutputMediaIds[platformId] || renderSignatures[platformId] !== renderSignatureFor(platformId),
  );
  const rendersAreCurrent = renderPlatforms.length > 0 && dirtyRenderPlatforms.length === 0;
  const failedRenderPlatform = Object.entries(platformRenderStatuses).find(([, status]) => status === "failed")?.[0];
  const readableRenderError = /^(fetch failed|failed to fetch)$/i.test(renderError?.trim() ?? "")
    ? "We couldn’t retrieve one of the source videos. Check your connection and try again."
    : renderError;
  const renderStatusLabel = (status: JobStatus | undefined) => {
    if (status === "queued") return "Queued";
    if (status === "compositing") return "Compositing";
    if (status === "generating") return "Rendering";
    if (status === "done") return "Ready";
    if (status === "failed") return "Failed";
    return "Preparing";
  };
  const reviewAccounts = slidesActiveTab
    ? accounts.filter((account) => selectedAccountIds.has(account.id) && account.platform === slidesActiveTab)
    : [];
  const reviewCaption = slidesActiveTab ? platformCaptions[slidesActiveTab] ?? "" : "";
  const reviewCaptionMax = slidesActiveTab
    ? CAPTION_MAX_BY_PLATFORM[slidesActiveTab as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? CAPTION_MAX
    : CAPTION_MAX;
  const activeOutputMediaId = (slidesActiveTab && platformOutputMediaIds[slidesActiveTab]) || outputMediaId;
  const canBuildAdvance = campaignName.trim().length > 0 && selectedAccountIds.size > 0 && filled === 4;
  // Captions are optional. The brief only powers AI Auto-fill when the user
  // wants platform-specific copy; a video can still proceed without it.
  const canCaptionAdvance = true;
  const buildRequirementHint = !campaignName.trim()
    ? "Add a campaign name to continue."
    : selectedAccountIds.size === 0
      ? "Choose at least one account under Post To to continue."
      : filled !== 4
        ? `Add ${4 - filled} more clip${4 - filled === 1 ? "" : "s"} to continue.`
        : "";
  const scheduledLabel = new Date(`${publishDate}T${publishTime || "00:00"}`).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const previewMaxWidth = previewExpanded
    ? slidesActiveAspectInfo.id === "16:9"
      ? 1100
      : 560
    : slidesActiveAspectInfo.id === "16:9"
      ? 800
      : slidesActiveAspectInfo.id === "1:1"
        ? 380
        : 320;
  // Review uses the same restrained canvas widths as Build. A post card should
  // frame the actual social format, not stretch a square/portrait render to
  // the width of the desktop card.
  const reviewPreviewMaxWidth =
    slidesActiveAspectInfo.id === "16:9" ? 800 : slidesActiveAspectInfo.id === "1:1" ? 380 : 320;
  const stackedPreview = previewExpanded || slidesActiveAspectInfo.id === "16:9";

  /* ----------------------------- data effects ----------------------------- */

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/studio/drafts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: StudioDraftRow[] } | null) => {
        if (!cancelled && data?.data) setDrafts(data.data.filter((d) => d.template === "grid-2x2"));
      })
      .catch(() => {})
      .finally(() => !cancelled && setDraftsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the render timing honest without inventing an ETA. The interval only
  // exists while work is actually in flight and stops on success or failure.
  useEffect(() => {
    if (!rendering || !renderStartedAt) return;
    const update = () => setRenderElapsedSeconds(Math.max(0, Math.floor((Date.now() - renderStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [rendering, renderStartedAt]);

  // Each selected platform gets its own render, using that platform's format
  // and crop. Poll them together so Review can switch between real outputs.
  useEffect(() => {
    const jobs = Object.keys(jobIds).length > 0 ? jobIds : jobId ? { default: jobId } : {};
    if (Object.keys(jobs).length === 0 || jobStatus === "idle" || jobStatus === "failed") return;
    if (jobStatus === "done" && Object.keys(platformOutputMediaIds).length >= Object.keys(jobs).length) return;
    const t = setTimeout(async () => {
      try {
        const entries = await Promise.all(Object.entries(jobs).map(async ([platformId, id]) => {
          const response = await fetch(`/api/app/studio/jobs/${id}`);
          return [platformId, response.ok ? await response.json() : null] as const;
        }));
        if (entries.some(([, job]) => !job)) return setPollNonce((n) => n + 1);
        setPlatformRenderStatuses((current) => ({
          ...current,
          ...Object.fromEntries(entries.map(([platformId, job]) => [platformId, job.status as JobStatus])),
        }));
        const failed = entries.find(([, job]) => job.status === "failed")?.[1];
        if (failed) {
          setJobStatus("failed");
          setRenderStartedAt(null);
          setRenderError(failed.error_message ?? "The render failed. Try again.");
          return;
        }
        const completed = Object.fromEntries(entries.filter(([, job]) => job.status === "done" && job.output_media_id).map(([platformId, job]) => [platformId, job.output_media_id]));
        if (Object.keys(completed).length > 0) setPlatformOutputMediaIds((current) => ({ ...current, ...completed }));
        if (Object.keys(completed).length > 0) {
          setRenderSignatures((current) => ({
            ...current,
            ...Object.fromEntries(Object.keys(completed).map((platformId) => [platformId, pendingRenderSignatures[platformId]])),
          }));
        }
        if (entries.every(([, job]) => job.status === "done")) {
          const firstOutput = Object.values(completed)[0] ?? outputMediaId;
          setJobStatus("done");
          setOutputMediaId(firstOutput ?? null);
          setRenderStartedAt(null);
          setStep((current) => (current === 0 && firstOutput ? 1 : current));
        } else {
          setJobStatus("generating");
          setPollNonce((n) => n + 1);
        }
      } catch { setPollNonce((n) => n + 1); }
    }, 3000);
    return () => clearTimeout(t);
  }, [jobId, jobIds, jobStatus, outputMediaId, platformOutputMediaIds, pendingRenderSignatures, pollNonce]);

  // Debounced autosave of the whole wizard state.
  useEffect(() => {
    const t = setTimeout(() => void persistDraft(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    step,
    clips,
    audioClips,
    audioTrack,
    borderOn,
    borderColor,
    borderWidth,
    borderOpacity,
    cropOffsets,
    trimStart,
    trimEnd,
    activePresetId,
    fps,
    campaignName,
    publishDate,
    publishTime,
    selectedAccountIds,
    description,
    captionLength,
    platformCaptions,
    jobId,
    jobIds,
    jobStatus,
    outputMediaId,
    platformOutputMediaIds,
    renderSignatures,
    pendingRenderSignatures,
    platformVideoFormatIds,
  ]);

  /* ------------------------------- mutations ------------------------------ */

  function setClip(index: number, media: ComposerMedia | null) {
    setClips((c) => c.map((x, i) => (i === index ? media : x)));
    setClipDurations((d) => d.map((x, i) => (i === index ? null : x)));
    setCropOffsets((c) =>
      Object.fromEntries(Object.entries(c).map(([key, bucket]) => [key, bucket.map((x, i) => (i === index ? DEFAULT_CROP : x))]))
    );
    pausePreview();
    setPreviewTime(0);
  }
  function toggleAudioClip(index: number) {
    setAudioClips((c) => (c.includes(index) ? c.filter((x) => x !== index) : [...c, index]));
  }
  function playPreview() {
    if (!clips.some(Boolean)) return;
    clipVideoRefs.current.forEach((v) => v?.play().catch(() => {}));
    setPreviewPlaying(true);
  }
  function pausePreview() {
    clipVideoRefs.current.forEach((v) => v?.pause());
    setPreviewPlaying(false);
  }
  function togglePreviewPlay() {
    if (previewPlaying) pausePreview();
    else playPreview();
  }
  function seekPreview(time: number) {
    clipVideoRefs.current.forEach((v) => {
      if (v) v.currentTime = time;
    });
    setPreviewTime(time);
  }
  function pickClipFile(index: number) {
    uploadTarget.current = index;
    clipInput.current?.click();
  }
  function openCropFlow(index: number, allSelectedPlatforms: boolean) {
    const keys = allSelectedPlatforms && visiblePlatformTabs.length > 0 ? [...visiblePlatformTabs] : [cropKey];
    setCropFlow({ index, keys, current: 0 });
  }
  async function onClipChosen(file: File) {
    const index = uploadTarget.current;
    setCellErrors((e) => ({ ...e, [index]: "" }));
    setBusyCells((b) => ({ ...b, [index]: true }));
    try {
      setClip(index, await uploadOneFile(file));
      openCropFlow(index, true);
    } catch (e) {
      setCellErrors((errs) => ({ ...errs, [index]: e instanceof Error ? e.message : "Upload failed" }));
    } finally {
      setBusyCells((b) => ({ ...b, [index]: false }));
    }
  }
  async function onAudioChosen(file: File) {
    setAudioErr(null);
    setAudioBusy(true);
    try {
      setAudioTrack(await uploadOneFile(file));
    } catch (e) {
      setAudioErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setAudioBusy(false);
    }
  }

  async function startRender() {
    setRenderError(null);
    const ids = clips.filter(Boolean).map((m) => m!.id);
    if (ids.length !== 4) {
      setRenderError("Add all four clips first.");
      return;
    }
    const targets = dirtyRenderPlatforms;
    if (targets.length === 0) {
      setStep(1);
      return;
    }
    const signatures = Object.fromEntries(targets.map((platformId) => [platformId, renderSignatureFor(platformId)]));
    setJobId(null); // avoid the poller chasing a previous job during re-render
    setJobIds({});
    setPendingRenderSignatures(signatures);
    setPlatformRenderStatuses(Object.fromEntries(targets.map((platformId) => [platformId, "queued" as JobStatus])));
    setRenderStartedAt(Date.now());
    setRenderElapsedSeconds(0);
    setJobStatus("queued");
    try {
      const started = await Promise.all(
        targets.map(async (platformId) => {
          const format = platformId === "default" ? null : selectedVideoFormatForPlatform(platformId, platformVideoFormatIds);
          const preset = format ? videoPresetById(format.presetId) ?? activePreset : effectivePreset;
          const aspect = format?.aspect ?? slidesActiveAspectInfo;
          const response = await fetch("/api/app/studio/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              template: "grid-2x2",
              media_ids: ids,
              video_preset_id: preset.id,
              aspect_ratio: aspect.id,
              fps,
              grid_audio: { clips: audioClips, ...(audioTrack ? { track_media_id: audioTrack.id } : {}) },
              grid_border: borderOn ? { width: borderWidth, color: borderColor, opacity: borderOpacity / 100 } : undefined,
              grid_crop: cropOffsets[platformId] ?? DEFAULT_CROP_SET,
              // Omitted entirely when untouched — sending a no-op {0, floor(duration)}
              // would truncate the default "-shortest" render to a whole-second
              // boundary for every video, not just ones someone actually trimmed.
              grid_trim: clampedTrimStart > 0 || trimEnd !== null ? { start_s: clampedTrimStart, end_s: effectiveTrimEnd } : undefined,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error?.message ?? "Could not start the render.");
          return [platformId, data] as const;
        }),
      );
      const nextJobIds = Object.fromEntries(started.map(([platformId, data]) => [platformId, data.id]));
      setJobIds(nextJobIds);
      setJobId(started[0]?.[1].id ?? null);
      setJobStatus(started.every(([, data]) => data.status === "done") ? "done" : "queued");
    } catch (e) {
      setJobStatus("failed");
      setRenderStartedAt(null);
      setPlatformRenderStatuses((current) =>
        Object.fromEntries(Object.keys(current).map((platformId) => [platformId, "failed" as JobStatus])),
      );
      setRenderError(e instanceof Error ? e.message : "Could not start the render. Check your connection and try again.");
    }
  }

  async function generateCaption(platformId: string) {
    if (captionBusy[platformId] || !description.trim()) return;
    setCaptionBusy((c) => ({ ...c, [platformId]: true }));
    setCaptionError((c) => ({ ...c, [platformId]: "" }));
    try {
      const res = await fetch("/api/app/studio/platform-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId, context: description, campaignName, length: captionLength }),
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

  /* -------------------------------- drafts -------------------------------- */

  async function persistDraft() {
    if (mode !== "wizard" || (!campaignName.trim() && filled === 0)) return;
    setDraftStatus("saving");
    const snapshot = {
      step,
      clips,
      audioClips,
      audioTrack,
      borderOn,
      borderColor,
      borderWidth,
      borderOpacity,
      cropOffsets,
      trimStart,
      trimEnd,
      activePresetId,
      fps,
      campaignName,
      publishDate,
      publishTime,
      selectedAccountIds: [...selectedAccountIds],
      description,
      captionLength,
      platformCaptions,
      jobId,
      jobIds,
      jobStatus,
      outputMediaId,
      platformOutputMediaIds,
      renderSignatures,
      pendingRenderSignatures,
      platformVideoFormatIds,
    };
    try {
      const res = await fetch("/api/app/studio/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftIdRef.current,
          template: "grid-2x2",
          mode: "custom",
          source_platform: null,
          title: campaignName || "Untitled grid video",
          cover_image_url: null,
          state: snapshot,
        }),
      });
      if (!res.ok) return setDraftStatus("idle");
      const saved = (await res.json()) as StudioDraftRow;
      draftIdRef.current = saved.id;
      setDrafts((cur) => [saved, ...cur.filter((d) => d.id !== saved.id)]);
      setDraftStatus("saved");
    } catch {
      setDraftStatus("idle");
    }
  }

  function resumeDraft(draft: StudioDraftRow) {
    let p: GridDraftSnapshot | undefined;
    try {
      p = JSON.parse(draft.state) as GridDraftSnapshot;
    } catch {
      return;
    }
    if (!p) return;
    draftIdRef.current = draft.id;
    setClips(p.clips ?? [null, null, null, null]);
    setAudioClips(p.audioClips ?? [0]);
    setAudioTrack(p.audioTrack ?? null);
    setBorderOn(p.borderOn ?? false);
    setBorderColor(p.borderColor ?? "#ffffff");
    setBorderWidth(p.borderWidth ?? 2);
    setBorderOpacity(p.borderOpacity ?? 100);
    // Guards against pre-existing drafts saved when cropOffsets was still a
    // flat per-quadrant array rather than a per-tab map.
    setCropOffsets(!Array.isArray(p.cropOffsets) && p.cropOffsets ? p.cropOffsets : {});
    setTrimStartRaw(typeof p.trimStart === "number" ? p.trimStart : 0);
    setTrimEndRaw(typeof p.trimEnd === "number" ? p.trimEnd : null);
    setActivePresetId(
      videoPresetById(p.activePresetId)?.id ??
        (typeof p.activePlatform === "string" ? videoPresetForLegacyPlatform(p.activePlatform).id : DEFAULT_VIDEO_PRESET)
    );
    setFps(normalizeVideoFps(p.fps));
    setCampaignName(p.campaignName ?? "");
    setPublishDate(p.publishDate ?? publishDate);
    setPublishTime(p.publishTime ?? publishTime);
    setSelectedAccountIds(new Set(p.selectedAccountIds ?? []));
    setDescription(p.description ?? "");
    setCaptionLength(p.captionLength ?? "medium");
    setPlatformCaptions(p.platformCaptions ?? {});
    setJobId(p.jobId ?? null);
    setJobIds(p.jobIds ?? (p.jobId ? { default: p.jobId } : {}));
    setJobStatus(p.jobStatus ?? "idle");
    setOutputMediaId(p.outputMediaId ?? null);
    setPlatformOutputMediaIds(p.platformOutputMediaIds ?? (p.outputMediaId ? { default: p.outputMediaId } : {}));
    setRenderSignatures(p.renderSignatures ?? {});
    setPendingRenderSignatures(p.pendingRenderSignatures ?? {});
    setPlatformRenderStatuses({});
    setRenderStartedAt(null);
    setRenderElapsedSeconds(0);
    setPlatformVideoFormatIds(p.platformVideoFormatIds ?? {});
    setDraftStatus("saved");
    setStep(Math.max(0, Math.min(STEPS.length - 1, p.step ?? 0)));
    setDraftLocked(draft.status === "finished");
    setFinishedMediaId(draft.status === "finished" ? (p.outputMediaId ?? null) : null);
    setMode("wizard");
  }

  async function deleteDraft(id: string) {
    setDrafts((cur) => cur.filter((d) => d.id !== id));
    if (draftIdRef.current === id) {
      draftIdRef.current = undefined;
      setDraftStatus("idle");
    }
    try {
      await fetch(`/api/app/studio/drafts/${id}`, { method: "DELETE" });
    } catch {
      /* best-effort */
    }
  }

  function resetWizard() {
    setStep(0);
    setClips([null, null, null, null]);
    setBusyCells({});
    setCellErrors({});
    setAudioClips([0]);
    setAudioTrack(null);
    setAudioErr(null);
    setBorderOn(false);
    setBorderColor("#ffffff");
    setBorderWidth(2);
    setBorderOpacity(100);
    setCropOffsets({});
    setTrimStartRaw(0);
    setTrimEndRaw(null);
    setActivePresetId(DEFAULT_VIDEO_PRESET);
    setFps(60);
    setJobId(null);
    setJobIds({});
    setJobStatus("idle");
    setOutputMediaId(null);
    setPlatformOutputMediaIds({});
    setRenderSignatures({});
    setPendingRenderSignatures({});
    setPlatformRenderStatuses({});
    setRenderStartedAt(null);
    setRenderElapsedSeconds(0);
    setRenderError(null);
    setCampaignName("");
    setSelectedAccountIds(new Set());
    setDescription("");
    setCaptionLength("medium");
    setPlatformCaptions({});
    setToneResults({});
    setPlatformVideoFormatIds({});
    setFinishedMediaId(null);
    setDraftLocked(false);
    draftIdRef.current = undefined;
    setDraftStatus("idle");
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);
    const wasCurrent = draftIdRef.current === id;
    await deleteDraft(id);
    if (wasCurrent) {
      resetWizard();
      setMode("choose");
    }
  }

  /* ----------------------------- navigation ------------------------------ */

  function goNext() {
    if (step === 0) {
      if (!canBuildAdvance || rendering) return;
      if (rendersAreCurrent) {
        setStep(1);
        return;
      }
      void startRender();
      return;
    }
    if (step === 1 && !canCaptionAdvance) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function goBack() {
    if (step === 0) {
      setMode("choose");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }
  function goToStep(nextStep: number) {
    if (nextStep > step) {
      if (step === 0 && (!canBuildAdvance || !rendersAreCurrent)) return;
      if (step === 1 && !canCaptionAdvance) return;
    }
    setStep(Math.max(0, Math.min(STEPS.length - 1, nextStep)));
  }

  const draftStatusPill =
    mode !== "wizard" || (!campaignName.trim() && filled === 0) ? null : (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
        {draftStatus === "saved" ? (
          <Icon name="check" size={13} className="text-primary-deep" />
        ) : (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
        )}
        {draftStatus === "saved" ? "Saved as draft" : "Saving draft…"}
      </span>
    );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3" data-edit-guard-exempt>
      <div>
        {mode === "choose" ? (
          <Link href="/dashboard/content-studio" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep">
            <Icon name="chevronLeft" size={15} /> Content Studio
          </Link>
        ) : (
          <button type="button" onClick={() => setMode("choose")} className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep">
            <Icon name="chevronLeft" size={15} /> Back to start
          </button>
        )}
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-contrast">
            <Icon name="grid" size={18} />
          </span>
          2×2 Grid Video Studio
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {draftLocked && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-deep"><Icon name="check" size={13} /> Finished</span>}
        {draftStatusPill}
      </div>
    </div>
  );

  /* ------------------------------- choose --------------------------------- */

  if (mode === "choose") {
    return (
      <StudioChooseScreen
        maxW="max-w-4xl"
        icon="grid"
        title="2×2 Grid Video Studio"
        headerExtra={draftStatusPill}
        cta={
          <StudioCtaCard
            title="Start a 2×2 grid video"
            description="Four clips play at once in a social-ready video — pick the platform format, audio, borders, then render and launch."
            buttonLabel="New grid video"
            onClick={() => { resetWizard(); setMode("wizard"); }}
          />
        }
        drafts={drafts}
        draftsLoading={draftsLoading}
        renderPreview={(draft) => <DraftPreview draft={draft} />}
        onResume={resumeDraft}
        onDelete={async (id) => {
          const wasCurrent = draftIdRef.current === id;
          await deleteDraft(id);
          if (wasCurrent) resetWizard();
        }}
      />
    );
  }

  /* -------------------------------- wizard -------------------------------- */

  const nextDisabled = step === 0 ? !canBuildAdvance || rendering : false;
  const nextTitle = step === 0 ? buildRequirementHint : undefined;
  const nextLabel = rendering
    ? STATUS_LABEL[jobStatus as Exclude<JobStatus, "idle">]
    : step === 0
      ? rendersAreCurrent
        ? "Continue to captions"
        : dirtyRenderPlatforms.length > 1
          ? "Render videos"
          : "Render video"
      : "Next";
  const nextButton = (
    <button type="button" onClick={goNext} disabled={nextDisabled} title={nextTitle || undefined} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
      {nextLabel} <Icon name="chevronRight" size={15} />
    </button>
  );

  const stepBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4" data-edit-guard-exempt>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="text-lg font-bold text-ink">{STEPS[step]}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {draftStatus !== "idle" && (
          <button type="button" onClick={() => setPendingDeleteId(draftIdRef.current ?? null)} className="btn-subtle !py-1.5 text-sm text-red-600 hover:text-red-700">
            <Icon name="trash" size={15} /> <span className="hidden sm:inline">Delete draft</span>
            <span className="sm:hidden">Delete</span>
          </button>
        )}
        <button type="button" onClick={goBack} className="btn-subtle !py-1.5 text-sm">
          <Icon name="chevronLeft" size={15} /> Back
        </button>
        {step === STEPS.length - 1 ? (
          !!outputMediaId && finishedMediaId === outputMediaId ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled className="btn-subtle !py-1.5 text-sm text-primary-deep"><Icon name="check" size={15} /> Finished</button>
              <button type="button" onClick={() => window.location.assign(`/dashboard/create/video?${new URLSearchParams({ media: outputMediaId ?? "", date: publishDate, time: publishTime })}`)} className="btn-primary !py-1.5 text-sm">Publish <Icon name="sparkles" size={15} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => void finish()} disabled={jobStatus !== "done" || !outputMediaId || finishing || publishScheduleIsPast} title={publishScheduleIsPast ? "Update the date and time on the Build step before finishing." : undefined} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
              {finishing ? "Finishing…" : publishScheduleIsPast ? <><Icon name="warningTriangle" size={15} /> Update schedule</> : "Finish"}
            </button>
          )
        ) : (
          nextButton
        )}
      </div>
    </div>
  );

  return (
    <div className="fade-up relative mx-auto w-full max-w-4xl pb-10" onClickCapture={editGuard.guard} onPointerDownCapture={editGuard.guard} onKeyDownCapture={editGuard.guard}>
      {editGuard.dialog}
      {header}

      <div className="card mt-5 px-6 py-5" data-edit-guard-exempt>
        <Stepper steps={STEPS} current={step} onNavigate={goToStep} />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        {stepBar}

        {/* STEP 1 — BUILD */}
        {step === 0 && (
          <div className="mt-5 flex flex-col gap-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <FieldLabel>Campaign Name</FieldLabel>
                <input className="input mt-2" placeholder="My Campaign…" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
              </div>
              <div>
                <FieldLabel icon="calendar">Publishing</FieldLabel>
                <div className="mt-2 flex items-center gap-2">
                  <input type="date" min={earliestPublishDate} value={publishDate} onChange={(e) => updatePublishDate(e.target.value)} className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
                  <input type="time" min={publishDate === earliestPublishDate ? earliestPublishTime : undefined} value={publishTime} onChange={(e) => updatePublishTime(e.target.value)} className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
                </div>
                {publishScheduleIsPast && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700" role="alert"><Icon name="warningTriangle" size={14} />This scheduled time has already passed.</p>}
              </div>
            </div>

            <section>
              <FieldLabel icon="users">Post To</FieldLabel>
              {accounts.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No accounts connected yet — connect some under Connections.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-3">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      title={a.username}
                      onClick={() =>
                        setSelectedAccountIds((cur) => {
                          const next = new Set(cur);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          return next;
                        })
                      }
                      className="flex flex-col items-center gap-1"
                    >
                      <AccountAvatar username={a.username} platformId={a.platform} avatarUrl={a.avatar_url} selected={selectedAccountIds.has(a.id)} />
                      <span className="max-w-[64px] truncate text-xs font-semibold text-muted">{a.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {visiblePlatformTabs.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
              {visiblePlatformTabs.map((pid) => {
                const isActive = pid === slidesActiveTab;
                const formatOptions = videoFormatOptionsForPlatform(pid);
                const activeFormat = selectedVideoFormatForPlatform(pid, platformVideoFormatIds);
                const canChooseFormat = formatOptions.length > 1;
                return (
                  <div
                    key={pid}
                    className={`flex items-stretch overflow-visible rounded-lg border text-xs font-bold transition-colors ${
                      isActive
                        ? "border-primary bg-primary-soft/50 text-primary-deep"
                        : "border-line bg-white text-muted hover:text-ink"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewPlatform(pid)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5"
                    >
                      <PlatformIcon id={pid} size={14} />
                      {platformOf(pid)?.name ?? pid}
                    </button>
                    {canChooseFormat ? (
                      <Popover
                        align="right"
                        width="min-w-[22rem]"
                        trigger={(open) => (
                          <span
                            className={`flex h-full items-center gap-1 border-l px-2 py-1.5 ${
                              isActive ? "border-primary/30 text-primary-deep/80" : "border-line text-muted/80"
                            } ${open ? "bg-white/60" : ""}`}
                          >
                            {activeFormat.aspect.name}
                            <Icon name="chevronDown" size={12} />
                          </span>
                        )}
                      >
                        {(close) => (
                          <>
                            <p className="px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                              Video format
                            </p>
                            {formatOptions.map((option) => (
                              <MenuRow
                                key={option.id}
                                active={option.id === activeFormat.id}
                                onClick={() => {
                                  setPlatformVideoFormatIds((cur) => ({ ...cur, [pid]: option.id }));
                                  setPreviewPlatform(pid);
                                  close();
                                }}
                              >
                                <PlatformIcon id={pid} size={15} className="shrink-0" />
                                <span className="min-w-0 flex-1">
                                  <span className="block font-bold">{option.label}</span>
                                  <span className="block text-xs text-muted">{option.placement}</span>
                                </span>
                                <span className="shrink-0 text-right font-bold text-ink">
                                  {option.aspect.name}
                                  <span className="block font-medium text-muted/70">{option.aspect.px}</span>
                                </span>
                              </MenuRow>
                            ))}
                          </>
                        )}
                      </Popover>
                    ) : (
                      <span className={`flex items-center px-2 py-1.5 ${isActive ? "text-primary-deep/70" : "text-muted/70"}`}>
                        {activeFormat.aspect.name}
                      </span>
                    )}
                  </div>
                );
              })}
                <AspectLegendPopover />
              </div>
            ) : (
              <p className="text-xs text-muted">Select accounts under Post To to choose a video format.</p>
            )}

            <div className={stackedPreview ? "flex flex-col gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]"}>
              <div className={stackedPreview ? "flex justify-center" : ""}>
                <div className={stackedPreview ? "w-full" : "mx-auto w-full"} style={{ maxWidth: `${previewMaxWidth}px` }}>
                  <div
                    className="relative overflow-hidden rounded-2xl ring-1 ring-line"
                    style={{ aspectRatio: `${slidesActiveAspectInfo.width} / ${slidesActiveAspectInfo.height}` }}
                  >
                    <div className={`grid h-full w-full grid-cols-2 grid-rows-2 ${borderOn ? "gap-px bg-line" : ""}`}>
                      {clips.map((media, i) => (
                        <Cell
                          key={i}
                          index={i}
                          media={media}
                          isAudio={audioClips.includes(i)}
                          busy={!!busyCells[i]}
                          error={cellErrors[i] || null}
                          onUpload={() => pickClipFile(i)}
                          onLibrary={() => setLibTarget(i)}
                          onRemove={() => setClip(i, null)}
                          videoRef={(el) => {
                            clipVideoRefs.current[i] = el;
                          }}
                          onLoadedMetadata={(duration) =>
                            setClipDurations((d) => d.map((x, di) => (di === i ? duration : x)))
                          }
                          onTimeUpdate={i === driverIndex ? setPreviewTime : undefined}
                          onEnded={i === driverIndex ? pausePreview : undefined}
                          cropOffset={activeCropOffsets[i]}
                          onReposition={() => openCropFlow(i, false)}
                          hideOverlays={hideOverlays}
                        />
                      ))}
                    </div>
                    {borderOn && borderWidth > 0 && (
                      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
                        <div
                          className="absolute inset-y-0 left-1/2 -translate-x-1/2"
                          style={{ width: `${(borderWidth / slidesActiveAspectInfo.width) * 100}%`, background: borderColor, opacity: borderOpacity / 100 }}
                        />
                        <div
                          className="absolute inset-x-0 top-1/2 -translate-y-1/2"
                          style={{ height: `${(borderWidth / slidesActiveAspectInfo.height) * 100}%`, background: borderColor, opacity: borderOpacity / 100 }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePreviewPlay}
                      disabled={filled === 0}
                      aria-label={previewPlaying ? "Pause preview" : "Play preview"}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-primary/40 disabled:opacity-40"
                    >
                      <Icon name={previewPlaying ? "pause" : "play"} size={12} />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={previewDuration || 0}
                      step={0.01}
                      value={Math.min(previewTime, previewDuration || 0)}
                      onChange={(e) => seekPreview(Number(e.target.value))}
                      disabled={!previewDuration}
                      aria-label="Seek preview"
                      className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    />
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
                      {formatTime(previewTime)} / {formatTime(previewDuration)}
                    </span>
                  </div>
                  <p className="mt-2 text-center text-xs text-muted">Double-click a clip to reposition its crop.</p>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <p className="text-center text-xs text-muted">Preview · {slidesActiveAspectInfo.px.replace("px", "")}</p>
                    <button
                      type="button"
                      onClick={() => setPreviewExpanded((v) => !v)}
                      className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary-deep transition-colors hover:border-primary hover:bg-primary-soft/70"
                    >
                      <Icon name="expand" size={12} />
                      {previewExpanded ? "Collapse" : "Expand"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHideOverlays((v) => !v)}
                      aria-pressed={hideOverlays}
                      title={hideOverlays ? "Show clip controls" : "Hide clip controls for a clean preview"}
                      className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold transition-colors ${
                        hideOverlays
                          ? "border-primary bg-primary text-primary-contrast hover:bg-primary-hover"
                          : "border-line bg-white text-muted hover:border-primary/40 hover:text-primary-deep"
                      }`}
                    >
                      <Icon name="eye" size={12} />
                      {hideOverlays ? "Show controls" : "Hide controls"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill bg-primary-soft text-primary-deep">{effectivePreset.name} · {slidesActiveAspectInfo.name}</span>
                  <span className="pill bg-page text-muted">Exports MP4 · {fps}fps</span>
                  <span className="pill bg-page text-muted">Trimmed to shortest clip</span>
                </div>
                <p className="-mt-3 text-xs font-semibold text-muted">Any video type · automatically cropped to fill each quadrant</p>

                <div>
                  <FieldLabel icon="video">Frame rate</FieldLabel>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {VIDEO_FPS_OPTIONS.map((option) => (
                      <AudioChip key={option} active={fps === option} onClick={() => setFps(option)}>
                        {option}fps
                      </AudioChip>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel icon="audio">Audio source</FieldLabel>
                  <p className="mt-1 text-xs text-muted">Tap clips to mix their sound — layer as many as you like.</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {CELLS.map((_, i) => (
                      <AudioChip key={i} active={audioClips.includes(i)} onClick={() => toggleAudioClip(i)}>
                        Clip {i + 1}
                      </AudioChip>
                    ))}
                  </div>
                  <div className="mt-3">
                    {audioTrack ? (
                      <div className="flex items-center gap-2 rounded-lg border border-line bg-page/60 px-3 py-2">
                        <Icon name="audio" size={15} className="shrink-0 text-primary-deep" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{audioTrack.name}</span>
                        <button type="button" onClick={() => audioInput.current?.click()} className="shrink-0 text-xs font-bold text-primary-deep hover:underline">
                          Replace
                        </button>
                        <button type="button" onClick={() => setAudioTrack(null)} aria-label="Remove track" className="shrink-0 text-muted hover:text-danger">
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Add music or voiceover:</span>
                        <button type="button" disabled={audioBusy} onClick={() => audioInput.current?.click()} className="btn-subtle !py-1 text-xs">
                          <Icon name="upload" size={13} /> {audioBusy ? "Uploading…" : "Upload"}
                        </button>
                        <button type="button" disabled={audioBusy} onClick={() => setAudioLibOpen(true)} className="btn-subtle !py-1 text-xs">
                          <Icon name="audio" size={13} /> Library
                        </button>
                      </div>
                    )}
                    {audioErr && <p className="mt-1 text-xs font-semibold text-danger">{audioErr}</p>}
                  </div>
                  <p className="mt-2.5 text-xs font-medium text-primary-deep">{audioSummary(audioClips, !!audioTrack)}</p>
                </div>

              <div>
                <div className="flex items-center justify-between">
                  <FieldLabel icon="grid">Grid borders</FieldLabel>
                  <button type="button" role="switch" aria-checked={borderOn} aria-label="Toggle grid borders" className="pt-toggle" data-on={borderOn} onClick={() => setBorderOn((v) => !v)}>
                    <span />
                  </button>
                </div>
                {borderOn && (
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex items-center gap-3 text-xs font-semibold text-ink">
                      <span className="w-14 shrink-0 text-muted">Color</span>
                      <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} aria-label="Border color" className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-white p-0.5" />
                      <HexColorInput value={borderColor} onChange={setBorderColor} />
                    </div>
                    <SliderRow label="Width" value={borderWidth} min={BORDER_MIN} max={BORDER_MAX} suffix="px" onChange={setBorderWidth} />
                    <SliderRow label="Opacity" value={borderOpacity} min={0} max={100} suffix="%" onChange={setBorderOpacity} />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <FieldLabel icon="trim">Trim</FieldLabel>
                  {(clampedTrimStart > 0 || trimEnd !== null) && (
                    <button type="button" onClick={resetTrim} className="text-xs font-bold text-primary-deep hover:underline">
                      Reset
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">Trims the composed video as a whole — all four quadrants together, not one at a time.</p>
                {maxTrimSeconds > 0 ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <SliderRow label="Start" value={clampedTrimStart} min={0} max={Math.max(0, effectiveTrimEnd - 1)} suffix="s" onChange={setTrimStart} />
                    <SliderRow label="End" value={effectiveTrimEnd} min={Math.min(maxTrimSeconds, clampedTrimStart + 1)} max={maxTrimSeconds} suffix="s" onChange={setTrimEnd} />
                    <p className="text-xs font-medium text-primary-deep">{formatTime(effectiveTrimEnd - clampedTrimStart)} final length</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Add clips to set a trim range.</p>
                )}
              </div>

              <div className="mt-auto">
                <div className="mb-2 text-sm font-semibold text-ink">{filled} of 4 clips</div>
                <div className="grid grid-cols-4 gap-1.5" aria-hidden>
                  {clips.map((m, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-colors ${m ? "bg-primary" : "bg-line"}`} />
                  ))}
                </div>
              </div>
            </div>

            {!canBuildAdvance && <p className="text-sm font-semibold text-muted">{buildRequirementHint}</p>}
            {jobStatus === "failed" && readableRenderError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-bold text-danger">
                    {failedRenderPlatform ? `${platformOf(failedRenderPlatform)?.name ?? failedRenderPlatform} couldn’t render.` : "Video render couldn’t start."}
                  </p>
                  <p className="mt-0.5 break-words text-muted">{readableRenderError}</p>
                </div>
                <button type="button" onClick={() => void startRender()} className="btn-subtle !py-1.5 text-sm">
                  <Icon name="refresh" size={14} /> Try again
                </button>
              </div>
            )}
            {canBuildAdvance && !rendering && dirtyRenderPlatforms.length > 0 && Object.keys(platformOutputMediaIds).length > 0 && (
              <p className="mt-3 text-xs font-semibold text-muted">
                {dirtyRenderPlatforms.length === 1
                  ? `One platform preview needs updating.`
                  : `${dirtyRenderPlatforms.length} platform previews need updating.`} Only those videos will render again.
              </p>
            )}
          </div>
          </div>
        )}

        {/* STEP 2 — CAPTIONS */}
        {step === 1 && (
          <div className="mt-5 flex flex-col gap-6">
            <section>
              <FieldLabel icon="video">Video preview</FieldLabel>
              {visiblePlatformTabs.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Preview platform">
                  {visiblePlatformTabs.map((platformId) => {
                    const active = platformId === slidesActiveTab;
                    const format = selectedVideoFormatForPlatform(platformId, platformVideoFormatIds);
                    return (
                      <button
                        key={platformId}
                        type="button"
                        onClick={() => setPreviewPlatform(platformId)}
                        aria-pressed={active}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                          active ? "border-primary bg-primary-soft/50 text-primary-deep" : "border-line bg-white text-muted hover:text-ink"
                        }`}
                      >
                        <PlatformIcon id={platformId} size={16} />
                        {platformOf(platformId)?.name ?? platformId}
                        <span className={active ? "text-primary-deep/70" : "text-muted/70"}>{format.aspect.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {activeOutputMediaId ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-line bg-ink shadow-sm">
                  {slidesActiveTab && (
                    <div className="flex items-center justify-between gap-3 border-b border-white/15 bg-ink px-4 py-2 text-xs font-semibold text-white/75">
                      <span className="flex min-w-0 items-center gap-1.5"><Icon name="video" size={13} /> Formatted for {platformOf(slidesActiveTab)?.name ?? slidesActiveTab}</span>
                      <span className="shrink-0">{slidesActiveAspectInfo.name} · {slidesActiveAspectInfo.px}</span>
                    </div>
                  )}
                  <div className="p-3 sm:p-4">
                    <div
                      className="mx-auto max-h-[52vh] w-full overflow-hidden rounded-lg bg-black"
                      style={{
                        aspectRatio: `${slidesActiveAspectInfo.width} / ${slidesActiveAspectInfo.height}`,
                        maxWidth: slidesActiveAspectInfo.id === "16:9" ? 900 : slidesActiveAspectInfo.id === "1:1" ? 560 : 420,
                      }}
                    >
                      <video src={`/api/media-file/${activeOutputMediaId}`} className="h-full w-full object-cover" controls playsInline />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex min-h-36 items-center justify-center rounded-xl border border-dashed border-line bg-page/40 text-sm font-semibold text-muted">
                  Your rendered video will appear here.
                </div>
              )}
            </section>
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel icon="sparkles">AI caption brief</FieldLabel>
                {selectedPlatforms.size > 0 && (
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
              <textarea
                className="input mt-2 h-16 resize-y"
                aria-describedby="ai-caption-brief-help"
                placeholder="Describe the video, audience, and key message…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p id="ai-caption-brief-help" className="mt-1.5 text-xs text-muted">
                This is an AI prompt used by Auto-fill to write platform-specific captions below.
              </p>
              {selectedPlatforms.size === 0 ? (
                <p className="mt-2 text-sm text-muted">Select accounts under Post To to write a caption for each platform.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {[...selectedPlatforms].map((id) => {
                    const max = CAPTION_MAX_BY_PLATFORM[id as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? CAPTION_MAX;
                    const value = platformCaptions[id] ?? "";
                    const tone = toneResults[id];
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
                        <div className="mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                          <textarea
                            className="h-20 w-full resize-y border-0 bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:ring-0"
                            maxLength={max}
                            value={value}
                            onChange={(e) => {
                              setPlatformCaptions((c) => ({ ...c, [id]: e.target.value }));
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
                            <button type="button" onClick={() => generateCaption(id)} disabled={captionBusy[id] || !description.trim()} title={!description.trim() ? "Add a description above first" : undefined} className="btn-subtle !py-1 text-xs disabled:opacity-50">
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
            </section>

          </div>
        )}

        {/* STEP 3 — REVIEW & LAUNCH */}
        {step === 2 && (
          <div className="mt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Campaign</p>
                <h3 className="text-xl font-black text-ink">{campaignName || "Untitled campaign"}</h3>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-page/60 px-3 py-2">
                <Icon name="calendar" size={16} className="text-primary-deep" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">Scheduled</p>
                  <p className="text-sm font-bold text-ink">{scheduledLabel}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold text-muted">
              {[
                `${selectedPlatforms.size} platform${selectedPlatforms.size === 1 ? "" : "s"}`,
                `${slidesActiveAspectInfo.name} video`,
                `${fps}fps`,
              ].map((fact) => (
                <span key={fact} className="rounded-full border border-line bg-white px-3 py-1">{fact}</span>
              ))}
            </div>

            {!activeOutputMediaId || jobStatus !== "done" ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-page/40 p-5 text-sm">
                <p className="font-semibold text-muted">Render the video in Build before reviewing the final post.</p>
                <button type="button" onClick={() => setStep(0)} className="btn-subtle !py-1.5 text-sm">
                  <Icon name="chevronLeft" size={14} /> Back to Build
                </button>
              </div>
            ) : visiblePlatformTabs.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-line bg-page/40 p-6 text-center text-sm font-semibold text-muted">
                No accounts selected. Go back to Build and choose where to post.
              </div>
            ) : (
              <div className="mt-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {visiblePlatformTabs.map((platformId) => {
                    const active = platformId === slidesActiveTab;
                    const format = selectedVideoFormatForPlatform(platformId, platformVideoFormatIds);
                    return (
                      <button
                        key={platformId}
                        type="button"
                        onClick={() => setPreviewPlatform(platformId)}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                          active ? "border-primary bg-primary-soft/50 text-primary-deep" : "border-line bg-white text-muted hover:text-ink"
                        }`}
                      >
                        <PlatformIcon id={platformId} size={16} />
                        {platformOf(platformId)?.name ?? platformId}
                        <span className={active ? "text-primary-deep/70" : "text-muted/70"}>{format.aspect.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {reviewAccounts.length > 0 ? (
                        <>
                          <AccountAvatar username={reviewAccounts[0].username} platformId={slidesActiveTab} avatarUrl={reviewAccounts[0].avatar_url} size={38} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-ink">{reviewAccounts[0].username}</p>
                            <p className="text-xs text-muted">{reviewAccounts.length > 1 ? `+${reviewAccounts.length - 1} more · ` : ""}{platformOf(slidesActiveTab)?.name}</p>
                          </div>
                        </>
                      ) : (
                        <><PlatformIcon id={slidesActiveTab} size={28} /><p className="text-sm font-bold text-ink">{platformOf(slidesActiveTab)?.name}</p></>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted"><Icon name="clock" size={13} /> {scheduledLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-4 pt-3 text-xs font-semibold text-muted">
                    <span className="flex items-center gap-1"><Icon name="video" size={13} /> Formatted for {platformOf(slidesActiveTab)?.name}</span>
                    <span>{slidesActiveFormat?.aspect.name} · {slidesActiveFormat?.aspect.px}</span>
                  </div>
                  <div className="bg-ink px-4 py-4">
                    <div
                      className="mx-auto w-full overflow-hidden rounded-xl ring-1 ring-white/15"
                      style={{
                        aspectRatio: `${slidesActiveAspectInfo.width} / ${slidesActiveAspectInfo.height}`,
                        maxWidth: `${reviewPreviewMaxWidth}px`,
                      }}
                    >
                      <video src={`/api/media-file/${activeOutputMediaId}`} className="h-full w-full object-contain" controls playsInline />
                    </div>
                  </div>
                  <div className="border-t border-line px-4 py-3">
                    <div className="flex items-center justify-between"><p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-muted"><Icon name="type" size={12} /> Caption</p><span className={`text-xs font-semibold ${reviewCaption.length > reviewCaptionMax ? "text-red-600" : "text-muted"}`}>{reviewCaption.length}/{reviewCaptionMax}</span></div>
                    {reviewCaption.trim() ? <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{reviewCaption}</p> : <p className="mt-1.5 text-sm italic text-muted">No caption yet — add one back in Captions.</p>}
                  </div>
                </div>
              </div>
            )}

            <details className="group mt-4 rounded-xl border border-line bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-ink">
                <span className="flex items-center gap-1.5"><Icon name="grid" size={14} /> Video details</span>
                <Icon name="chevronDown" size={16} className="text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2">
                {[
                  ["Format", `${effectivePreset.name} · ${slidesActiveAspectInfo.name}`],
                  ["Frame rate", `${fps}fps`],
                  ["Audio", audioSummary(audioClips, !!audioTrack)],
                  ["Borders", borderOn ? `${borderWidth}px ${borderColor}` : "None"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-page/60 p-3"><p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{label}</p><p className="mt-0.5 text-sm font-bold text-ink">{value}</p></div>
                ))}
              </div>
            </details>
          </div>
        )}

        <div className="mt-8 border-t border-line pt-5" data-edit-guard-exempt>
          {step === 0 && rendering && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                  Rendering
                </span>
                {Object.keys(platformRenderStatuses).map((platformId) => (
                  <span key={platformId} className="inline-flex items-center gap-1 rounded-full border border-line bg-page px-2 py-1">
                    <PlatformIcon id={platformId} size={12} />
                    {platformOf(platformId)?.name ?? platformId} · {renderStatusLabel(platformRenderStatuses[platformId])}
                  </span>
                ))}
                <span className="tabular-nums">{formatTime(renderElapsedSeconds)} elapsed</span>
                <span className="hidden xl:inline">You can leave while this runs.</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={goBack} className="btn-subtle !py-1.5 text-sm">
              <Icon name="chevronLeft" size={15} /> Back
            </button>
            {step === STEPS.length - 1 ? (
              !!outputMediaId && finishedMediaId === outputMediaId ? (
                <div className="flex items-center gap-2">
                  <button type="button" disabled className="btn-subtle !py-1.5 text-sm text-primary-deep"><Icon name="check" size={15} /> Finished</button>
                  <button type="button" onClick={() => window.location.assign(`/dashboard/create/video?${new URLSearchParams({ media: outputMediaId ?? "", date: publishDate, time: publishTime })}`)} className="btn-primary !py-1.5 text-sm">Publish <Icon name="sparkles" size={15} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => void finish()} disabled={!outputMediaId || finishing || publishScheduleIsPast} title={publishScheduleIsPast ? "Update the date and time on the Build step before finishing." : undefined} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
                  {finishing ? "Finishing…" : publishScheduleIsPast ? <><Icon name="warningTriangle" size={15} /> Update schedule</> : "Finish"}
                </button>
              )
            ) : (
              <button type="button" onClick={goNext} disabled={nextDisabled} title={nextTitle || undefined} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
                {nextLabel} <Icon name="chevronRight" size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* shared inputs + modals */}
      <input
        ref={clipInput}
        type="file"
        accept="video/*,.3g2,.3gp,.avi,.flv,.m2ts,.m4v,.mkv,.mov,.mp4,.mpe,.mpeg,.mpg,.mts,.ogv,.ts,.webm,.wmv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onClipChosen(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onAudioChosen(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {libTarget !== null && (
        <MediaLibraryModal
          kind="video"
          onClose={() => setLibTarget(null)}
          onPick={(m) => {
            setClip(libTarget, m);
            openCropFlow(libTarget, true);
            setLibTarget(null);
          }}
        />
      )}
      {audioLibOpen && (
        <MediaLibraryModal
          kind="audio"
          onClose={() => setAudioLibOpen(false)}
          onPick={(m) => {
            setAudioTrack(m);
            setAudioLibOpen(false);
          }}
        />
      )}
      {pendingDeleteId && <ConfirmDialog title="Delete draft?" message="This grid video draft will be removed. This can't be undone." onCancel={() => setPendingDeleteId(null)} onConfirm={confirmDelete} />}
      {cropFlow !== null && clips[cropFlow.index] && (
        <CropModal
          media={clips[cropFlow.index]!}
          targetAspect={cropFlowAspect.width / cropFlowAspect.height}
          initial={(cropOffsets[cropFlowKey] ?? DEFAULT_CROP_SET)[cropFlow.index]}
          progressLabel={
            cropFlow.keys.length > 1
              ? `Crop ${cropFlow.current + 1} of ${cropFlow.keys.length} · ${platformOf(cropFlowKey)?.name ?? cropFlowKey}`
              : undefined
          }
          actionLabel={cropFlow.current < cropFlow.keys.length - 1 ? "Next crop" : "Save"}
          onCancel={() => setCropFlow(null)}
          onSave={(offset) => {
            setCropOffsets((c) => {
              const bucket = c[cropFlowKey] ?? DEFAULT_CROP_SET;
              return { ...c, [cropFlowKey]: bucket.map((x, i) => (i === cropFlow.index ? offset : x)) };
            });
            if (cropFlow.current < cropFlow.keys.length - 1) {
              setCropFlow({ ...cropFlow, current: cropFlow.current + 1 });
            } else {
              setCropFlow(null);
            }
          }}
        />
      )}
    </div>
  );
}
