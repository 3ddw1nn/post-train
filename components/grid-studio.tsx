"use client";

// Full 2x2 Grid Video studio, mirroring Slideshow Studio's shape: a choose
// screen with resumable Drafts, then a three-step wizard — Build (compose the
// grid), Render (produce + preview + download the video), Launch (campaign,
// post-to accounts, per-platform captions). Audio can mix any subset of clips
// plus an uploaded track; optional colored separators sit between quadrants.
// Renders go through /api/app/studio/jobs (ffmpeg); clips/audio/output all
// live in the shared media pipeline (R2 when configured). The Launch button is
// a placeholder for now, matching Slideshow.
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

export type GridAccount = { id: number; platform: string; username: string; avatar_url: string | null };
type JobStatus = "idle" | "queued" | "generating" | "compositing" | "done" | "failed";
type GridDraftSnapshot = Partial<{
  step: number;
  clips: (ComposerMedia | null)[];
  audioClips: number[];
  audioTrack: ComposerMedia | null;
  borderOn: boolean;
  borderColor: string;
  borderWidth: number;
  borderOpacity: number;
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
  jobStatus: JobStatus;
  outputMediaId: string | null;
  platformVideoFormatIds: Record<string, string>;
}>;

const STEPS = ["Build", "Render", "Launch"] as const;
const CELLS = [{ label: "Top left" }, { label: "Top right" }, { label: "Bottom left" }, { label: "Bottom right" }] as const;
const BORDER_MIN = 2;
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

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function FieldLabel({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-muted">
      {icon && <Icon name={icon} size={14} />}
      {children}
    </p>
  );
}

function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black transition-colors ${
                  done
                    ? "border-primary bg-primary text-white"
                    : active
                      ? "border-primary bg-primary-soft text-primary-deep ring-4 ring-primary-soft/70"
                      : "border-line bg-white text-muted"
                }`}
              >
                {done ? <Icon name="check" size={17} /> : i + 1}
              </span>
              <span className={`text-xs font-black uppercase tracking-[0.12em] ${active ? "text-primary-deep" : done ? "text-ink" : "text-muted"}`}>
                {label}
              </span>
            </div>
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
      <span className="w-10 shrink-0 text-right tabular-nums text-ink">
        {value}
        {suffix}
      </span>
    </label>
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
}: {
  index: number;
  media: ComposerMedia | null;
  isAudio: boolean;
  busy: boolean;
  error: string | null;
  onUpload: () => void;
  onLibrary: () => void;
  onRemove: () => void;
}) {
  const cell = CELLS[index];
  return (
    <div className={`group relative overflow-hidden ${media ? "bg-ink" : "bg-white hover:bg-primary-soft/30"}`}>
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

      {media ? (
        <>
          <video key={media.id} src={`/api/media-file/${media.id}`} className="fade-up absolute inset-0 h-full w-full object-cover" muted playsInline preload="metadata" />
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

function DraftsSection({ drafts, loading, onResume, onDelete }: { drafts: StudioDraftRow[]; loading: boolean; onResume: (d: StudioDraftRow) => void; onDelete: (id: string) => void }) {
  return (
    <div className="card mt-5 p-6 sm:p-8">
      <FieldLabel>Drafts</FieldLabel>
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-muted" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
          Loading drafts…
        </div>
      ) : drafts.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-muted">No saved drafts.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((d) => (
            <div key={d.id} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-3 transition-colors hover:border-primary hover:bg-primary-soft/30">
              <button type="button" onClick={() => onResume(d)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
                  <Icon name="grid" size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">{d.title}</span>
                  <span className="mt-1 block text-xs font-semibold text-muted">{relativeTime(d.updated_at)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                aria-label={`Delete draft ${d.title}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-ink/10 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [borderWidth, setBorderWidth] = useState(8);
  const [borderOpacity, setBorderOpacity] = useState(100);
  const [activePresetId, setActivePresetId] = useState<VideoPresetId>(DEFAULT_VIDEO_PRESET);
  const [fps, setFps] = useState<VideoFps>(60);
  const [previewPlatform, setPreviewPlatform] = useState<string>("");
  const [platformVideoFormatIds, setPlatformVideoFormatIds] = useState<Record<string, string>>({});

  // Render
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [outputMediaId, setOutputMediaId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pollNonce, setPollNonce] = useState(0);

  // Launch
  const [campaignName, setCampaignName] = useState("");
  const [publishDate, setPublishDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [publishTime, setPublishTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const [description, setDescription] = useState("");
  const [captionLength, setCaptionLength] = useState<"short" | "medium" | "long">("medium");
  const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>({});
  const [captionBusy, setCaptionBusy] = useState<Record<string, boolean>>({});
  const [captionError, setCaptionError] = useState<Record<string, string>>({});
  const [toneResults, setToneResults] = useState<Record<string, AiToneResult>>({});
  const [improveBusy, setImproveBusy] = useState<Record<string, boolean>>({});

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
  const activePreset = videoPresetById(activePresetId) ?? VIDEO_PRESETS[0];
  const activeAspect = activePreset.aspect;

  // Which platform tab is active in the build step
  const slidesActiveTab = (VIDEO_PREVIEW_PLATFORM_TABS as readonly string[]).includes(previewPlatform) ? previewPlatform : VIDEO_PREVIEW_PLATFORM_TABS[0];
  const slidesActiveFormat = slidesActiveTab ? selectedVideoFormatForPlatform(slidesActiveTab, platformVideoFormatIds) : null;
  const slidesActiveAspect = slidesActiveFormat?.aspect.id ?? activeAspect.id;
  const slidesActiveAspectInfo = VIDEO_ASPECTS.find((a) => a.id === slidesActiveAspect) ?? activeAspect;

  const previewMaxWidth = slidesActiveAspectInfo.id === "16:9" ? 800 : slidesActiveAspectInfo.id === "1:1" ? 380 : 320;
  const selectedPlatforms = new Set(
    [...selectedAccountIds].map((id) => accounts.find((a) => a.id === id)?.platform).filter((p): p is string => !!p)
  );

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

  // Poll the render job until it finishes. pollNonce re-arms the timer even
  // when the status string is unchanged (still generating) or a fetch failed.
  useEffect(() => {
    if (!jobId || jobStatus === "idle" || jobStatus === "done" || jobStatus === "failed") return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/app/studio/jobs/${jobId}`);
        const j = r.ok ? await r.json() : null;
        if (!j) return setPollNonce((n) => n + 1);
        if (j.status === "done") {
          setJobStatus("done");
          setOutputMediaId(j.output_media_id ?? null);
        } else if (j.status === "failed") {
          setJobStatus("failed");
          setRenderError(j.error_message ?? "Render failed.");
        } else {
          setJobStatus(j.status);
          setPollNonce((n) => n + 1);
        }
      } catch {
        setPollNonce((n) => n + 1);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [jobId, jobStatus, pollNonce]);

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
    jobStatus,
    outputMediaId,
    platformVideoFormatIds,
  ]);

  /* ------------------------------- mutations ------------------------------ */

  function setClip(index: number, media: ComposerMedia | null) {
    setClips((c) => c.map((x, i) => (i === index ? media : x)));
  }
  function toggleAudioClip(index: number) {
    setAudioClips((c) => (c.includes(index) ? c.filter((x) => x !== index) : [...c, index]));
  }
  function pickClipFile(index: number) {
    uploadTarget.current = index;
    clipInput.current?.click();
  }
  async function onClipChosen(file: File) {
    const index = uploadTarget.current;
    setCellErrors((e) => ({ ...e, [index]: "" }));
    setBusyCells((b) => ({ ...b, [index]: true }));
    try {
      setClip(index, await uploadOneFile(file));
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
    setJobId(null); // avoid the poller chasing a previous job during re-render
    setJobStatus("queued");
    setOutputMediaId(null);
    try {
      const res = await fetch("/api/app/studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "grid-2x2",
          media_ids: ids,
          video_preset_id: activePreset.id,
          aspect_ratio: activeAspect.id,
          fps,
          grid_audio: { clips: audioClips, ...(audioTrack ? { track_media_id: audioTrack.id } : {}) },
          grid_border: borderOn ? { width: borderWidth, color: borderColor, opacity: borderOpacity / 100 } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Could not start the render.");
      setJobId(data.id);
      setJobStatus(data.status ?? "queued");
    } catch (e) {
      setJobStatus("failed");
      setRenderError(e instanceof Error ? e.message : "Could not start the render.");
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
      jobStatus,
      outputMediaId,
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
    setBorderWidth(p.borderWidth ?? 8);
    setBorderOpacity(p.borderOpacity ?? 100);
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
    setJobStatus(p.jobStatus ?? "idle");
    setOutputMediaId(p.outputMediaId ?? null);
    setPlatformVideoFormatIds(p.platformVideoFormatIds ?? {});
    setDraftStatus("saved");
    setStep(p.step ?? 0);
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
    setBorderWidth(8);
    setBorderOpacity(100);
    setActivePresetId(DEFAULT_VIDEO_PRESET);
    setFps(60);
    setJobId(null);
    setJobStatus("idle");
    setOutputMediaId(null);
    setRenderError(null);
    setCampaignName("");
    setSelectedAccountIds(new Set());
    setDescription("");
    setCaptionLength("medium");
    setPlatformCaptions({});
    setToneResults({});
    setPlatformVideoFormatIds({});
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
    if (step === 0 && filled !== 4) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function goBack() {
    if (step === 0) {
      setMode("choose");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
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
    <div className="flex flex-wrap items-center justify-between gap-3">
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
          2×2 Grid Video
        </h1>
      </div>
      {draftStatusPill}
    </div>
  );

  /* ------------------------------- choose --------------------------------- */

  if (mode === "choose") {
    return (
      <div className="fade-up mx-auto w-full max-w-4xl pb-10">
        {header}
        <div className="card mt-5 p-6 sm:p-8">
          <h2 className="text-xl font-black text-ink">Start a 2×2 grid video</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Four clips play at once in a social-ready video — pick the platform format, audio, borders, then render and launch.
          </p>
          <button type="button" onClick={() => { resetWizard(); setMode("wizard"); }} className="btn-primary mt-5">
            <Icon name="plus" size={15} /> New grid video
          </button>
        </div>
        <DraftsSection drafts={drafts} loading={draftsLoading} onResume={resumeDraft} onDelete={(id) => setPendingDeleteId(id)} />
        {pendingDeleteId && (
          <ConfirmDialog title="Delete draft?" message="This grid video draft will be removed. This can't be undone." onCancel={() => setPendingDeleteId(null)} onConfirm={confirmDelete} />
        )}
      </div>
    );
  }

  /* -------------------------------- wizard -------------------------------- */

  const stepBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
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
          <button type="button" className="btn-primary !py-1.5 text-sm">
            Launch <Icon name="sparkles" size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={step === 0 && filled !== 4}
            className="btn-primary !py-1.5 text-sm disabled:opacity-50"
            title={step === 0 && filled !== 4 ? "Add all four clips to continue" : undefined}
          >
            Continue <Icon name="chevronRight" size={15} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fade-up mx-auto w-full max-w-4xl pb-10">
      {header}

      <div className="card mt-5 px-6 py-5">
        <Stepper steps={STEPS} current={step} />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        {stepBar}

        {/* STEP 1 — BUILD */}
        {step === 0 && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              {VIDEO_PREVIEW_PLATFORM_TABS.map((pid) => {
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

            <div className={slidesActiveAspectInfo.id === "16:9" ? "flex flex-col gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]"}>
              <div className={slidesActiveAspectInfo.id === "16:9" ? "flex justify-center" : ""}>
                <div className={slidesActiveAspectInfo.id === "16:9" ? "w-full" : "mx-auto w-full"} style={{ maxWidth: `${previewMaxWidth}px` }}>
                  <div
                    className="relative overflow-hidden rounded-2xl ring-1 ring-line"
                    style={{ aspectRatio: `${slidesActiveAspectInfo.width} / ${slidesActiveAspectInfo.height}` }}
                  >
                    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-line">
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
                  <p className="mt-2 text-center text-xs text-muted">Preview · {slidesActiveAspectInfo.px.replace("px", "")}</p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill bg-primary-soft text-primary-deep">{activePreset.name} · {slidesActiveAspectInfo.name}</span>
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
                      <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} aria-label="Border color" className="h-8 w-10 cursor-pointer rounded-md border border-line bg-white p-0.5" />
                      <span className="font-mono uppercase tabular-nums text-muted">{borderColor}</span>
                    </div>
                    <SliderRow label="Width" value={borderWidth} min={BORDER_MIN} max={BORDER_MAX} suffix="px" onChange={setBorderWidth} />
                    <SliderRow label="Opacity" value={borderOpacity} min={0} max={100} suffix="%" onChange={setBorderOpacity} />
                  </div>
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
          </div>
          </div>
        )}

        {/* STEP 2 — RENDER */}
        {step === 1 && (
          <div className="mt-5">
            {jobStatus === "done" && outputMediaId ? (
              <div className="flex flex-col items-center gap-4">
                <video src={`/api/media-file/${outputMediaId}`} className="max-h-[60vh] w-auto rounded-2xl bg-ink" controls playsInline />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a href={`/api/media-file/${outputMediaId}`} download={`${(campaignName || "grid-video").replace(/[^\w.-]+/g, "-")}.mp4`} className="btn-primary">
                    <Icon name="download" size={15} /> Download
                  </a>
                  <button type="button" onClick={startRender} className="btn-subtle">
                    <Icon name="refresh" size={15} /> Re-render
                  </button>
                </div>
              </div>
            ) : rendering ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-page/40 px-6 py-14 text-center">
                <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary" />
                <p className="text-lg font-black text-ink">{STATUS_LABEL[jobStatus as Exclude<JobStatus, "idle">]}</p>
                <p className="max-w-sm text-sm text-muted">This usually takes a minute or two. You can leave — it renders in the background and shows up under Content Studio.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-page/40 px-6 py-12 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-deep">
                  <Icon name="sparkles" size={26} />
                </span>
                <div>
                  <p className="text-lg font-black text-ink">Render your grid video</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    Combines your four clips into one {activePreset.name.toLowerCase()} at {slidesActiveAspectInfo.name} and {fps}fps
                    with the audio mix{borderOn ? " and borders" : ""} you set. Stored to your library when done.
                  </p>
                </div>
                {renderError && <p className="text-sm font-semibold text-danger">{renderError}</p>}
                <button type="button" onClick={startRender} className="btn-primary">
                  <Icon name="sparkles" size={15} /> Render video
                </button>
              </div>
            )}
            {jobStatus === "failed" && renderError && <p className="mt-3 text-center text-sm font-semibold text-danger">{renderError}</p>}
          </div>
        )}

        {/* STEP 3 — LAUNCH */}
        {step === 2 && (
          <div className="mt-5 flex flex-col gap-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <FieldLabel>Campaign Name</FieldLabel>
                <input className="input mt-2" placeholder="My Campaign…" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
              </div>
              <div>
                <FieldLabel icon="calendar">Publishing</FieldLabel>
                <div className="mt-2 flex items-center gap-2">
                  <input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
                  <input type="time" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
                </div>
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

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>Captions</FieldLabel>
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
                placeholder="What's this video about? Used to write captions…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
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

            <section>
              <FieldLabel icon="video">Your video</FieldLabel>
              {outputMediaId ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <video src={`/api/media-file/${outputMediaId}`} className="h-40 w-auto rounded-xl bg-ink" muted playsInline />
                  <a href={`/api/media-file/${outputMediaId}`} download={`${(campaignName || "grid-video").replace(/[^\w.-]+/g, "-")}.mp4`} className="btn-subtle">
                    <Icon name="download" size={15} /> Download
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Not rendered yet — go back to <b className="font-semibold text-ink">Render</b> to generate the video first.
                </p>
              )}
            </section>
          </div>
        )}
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
    </div>
  );
}