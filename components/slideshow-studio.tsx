"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "./icons";
import { PlatformIcon, AccountAvatar } from "./platform-icon";
import { uploadOneFile } from "./media";
import { platform as platformOf, CAROUSEL_MAX, CAPTION_MAX, CAPTION_MAX_BY_PLATFORM } from "@/lib/platforms";
import { checkAiTone, type AiToneResult } from "@/lib/ai-tone";
import type { StudioDraftMode, StudioDraftRow } from "@/lib/studio-drafts";
import { MODEL_PROVIDER, type ImageGenProvider } from "@/lib/image-gen";

const CUSTOM_STEPS = ["Settings", "Review & Launch"] as const;
const TEMPLATE_STEPS = ["Templates", "Settings", "Images", "Launch"] as const;
const REFERENCE_MAX = 5;
const CONTEXT_MAX = 1200;
// Cap per-slide overlay text so it can't overflow the image. A short headline
// wraps and stays inside the safe area; longer copy belongs in the caption.
const SLIDE_TEXT_MAX = 150;
const SLIDE_MIN = 2;
// TikTok's photo mode (35) is the highest of any platform's carousel cap
// (see CAROUSEL_MAX in lib/platforms.ts), so it's the app-wide ceiling —
// lower per-platform caps are surfaced as a heads-up instead of enforced.
const SLIDE_MAX = 35;

const SLIDE_SOURCES = [
  { id: "auto", name: "Auto", short: "Auto", icon: "sparkles", desc: "Let Post Train pick the best source." },
  { id: "ai", name: "AI Generated", short: "AI", icon: "sparkles", desc: "Generate images from your prompt." },
  { id: "upload", name: "Upload Image", short: "Upload", icon: "upload", desc: "Use your own photo." },
  { id: "pack", name: "Image Pack", short: "Pack", icon: "image", desc: "Start from a saved image set." },
  { id: "character", name: "Consistent Character", short: "Character", icon: "users", desc: "Keep the same person/object style.", credits: 2 },
] as const;

// AI image providers for the Visual Style / generation step. The backend
// calls live in lib/image-gen.ts; nothing in this screen invokes them yet —
// the Launch button below has no handler for any Studio job type yet.
const AI_MODELS = [
  { id: "gpt-image-2", name: "GPT Image 2", desc: "Sharp layouts, text, and references", credits: 2 },
  { id: "nano-banana-2", name: "Nano Banana 2", desc: "Fast, high quality, and reference-aware", credits: 1 },
  { id: "seedream-5", name: "SeeDream 5", desc: "Best balance of quality and speed", credits: 1 },
] as const;

const ASPECTS = [
  { id: "9:16", name: "9:16", hint: "Portrait", px: "1080×1920px" },
  { id: "2:3", name: "2:3", hint: "Portrait", px: "1000×1500px" },
  { id: "4:5", name: "4:5", hint: "Portrait", px: "1080×1350px" },
  { id: "1:1", name: "1:1", hint: "Square", px: "1080×1080px" },
  { id: "16:9", name: "16:9", hint: "Landscape", px: "1920×1080px" },
] as const;

type PhotoPreset = {
  id: string;
  name: string;
  aspect: (typeof ASPECTS)[number];
  placement: string;
  targets: { platformId: string; label: string }[];
};
type PhotoFormatOption = {
  id: string;
  label: string;
  presetName: string;
  placement: string;
  aspect: (typeof ASPECTS)[number];
};

const aspectInfo = (id: (typeof ASPECTS)[number]["id"]) => ASPECTS.find((a) => a.id === id)!;

const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: "vertical-full-screen",
    name: "Vertical Full Screen",
    aspect: aspectInfo("9:16"),
    placement: "Full-screen photo posts and Stories",
    targets: [
      { platformId: "tiktok", label: "TikTok Photo Posts" },
      { platformId: "instagram", label: "Instagram Stories" },
      { platformId: "facebook", label: "Facebook Stories" },
    ],
  },
  {
    id: "pinterest-portrait",
    name: "Pinterest Portrait",
    aspect: aspectInfo("2:3"),
    placement: "Standard Pinterest Pins",
    targets: [{ platformId: "pinterest", label: "Pinterest Pins" }],
  },
  {
    id: "portrait-feed",
    name: "Portrait Feed",
    aspect: aspectInfo("4:5"),
    placement: "Mobile feed photo posts",
    targets: [
      { platformId: "instagram", label: "Instagram Feed" },
      { platformId: "threads", label: "Threads" },
      { platformId: "linkedin", label: "LinkedIn" },
      { platformId: "facebook", label: "Facebook Feed" },
    ],
  },
  {
    id: "square-feed",
    name: "Square Feed",
    aspect: aspectInfo("1:1"),
    placement: "Safe general-purpose feed images",
    targets: [
      { platformId: "youtube", label: "YouTube Community Posts" },
      { platformId: "twitter", label: "X" },
      { platformId: "bluesky", label: "Bluesky" },
      { platformId: "mastodon", label: "Mastodon" },
      { platformId: "google_business", label: "Google Business Profile" },
    ],
  },
  {
    id: "landscape",
    name: "Landscape",
    aspect: aspectInfo("16:9"),
    placement: "Optional landscape photo posts",
    targets: [
      { platformId: "twitter", label: "X" },
      { platformId: "bluesky", label: "Bluesky" },
      { platformId: "mastodon", label: "Mastodon" },
      { platformId: "linkedin", label: "LinkedIn" },
      { platformId: "facebook", label: "Facebook landscape posts" },
    ],
  },
];
// TEMP preview mode: show every photo-capable destination tab even before the
// user connects/selects accounts, so the formatting UI can be reviewed.
const PHOTO_PREVIEW_PLATFORM_TABS = Array.from(
  new Set(PHOTO_PRESETS.flatMap((preset) => preset.targets.map((target) => target.platformId))),
);

// Recommended photo aspect for each platform's default slideshow/feed tab.
// The guide below carries the richer placement presets, including Story and
// optional landscape variants where the same platform can appear more than once.
const PLATFORM_ASPECT: Record<string, (typeof ASPECTS)[number]["id"]> = {
  tiktok: "9:16",
  youtube: "1:1",
  pinterest: "2:3",
  threads: "4:5",
  linkedin: "4:5",
  instagram: "4:5",
  twitter: "1:1",
  bluesky: "1:1",
  mastodon: "1:1",
  facebook: "4:5",
  google_business: "1:1",
};
function platformAspect(platformId: string): (typeof ASPECTS)[number]["id"] {
  return PLATFORM_ASPECT[platformId] ?? "9:16";
}

function photoFormatOptionsForPlatform(platformId: string): PhotoFormatOption[] {
  return PHOTO_PRESETS.flatMap((preset) =>
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

function defaultPhotoFormatForPlatform(platformId: string): PhotoFormatOption {
  const options = photoFormatOptionsForPlatform(platformId);
  const preferredAspect = platformAspect(platformId);
  return options.find((option) => option.aspect.id === preferredAspect) ?? options[0] ?? {
    id: `${platformId}:default`,
    label: platformOf(platformId)?.name ?? platformId,
    presetName: "Default",
    placement: "Recommended photo format",
    aspect: ASPECTS[0],
  };
}

function selectedPhotoFormatForPlatform(platformId: string, selected: Record<string, string>): PhotoFormatOption {
  const options = photoFormatOptionsForPlatform(platformId);
  return options.find((option) => option.id === selected[platformId]) ?? defaultPhotoFormatForPlatform(platformId);
}

const OVERLAYS = [
  { id: "none", name: "No Overlays", desc: "Just the images, no text on top", icon: "image" },
  { id: "text", name: "Text Overlays", desc: "Add captions on top of images", icon: "type" },
] as const;

const LANGUAGES = [
  { id: "en", name: "English", flag: "🇺🇸" },
  { id: "es", name: "Spanish", flag: "🇪🇸" },
  { id: "fr", name: "French", flag: "🇫🇷" },
  { id: "de", name: "German", flag: "🇩🇪" },
  { id: "pt", name: "Portuguese", flag: "🇧🇷" },
  { id: "it", name: "Italian", flag: "🇮🇹" },
  { id: "ja", name: "Japanese", flag: "🇯🇵" },
  { id: "ko", name: "Korean", flag: "🇰🇷" },
  { id: "zh", name: "Chinese", flag: "🇨🇳" },
  { id: "ar", name: "Arabic", flag: "🇸🇦" },
] as const;

const SLIDE_CATEGORIES = [
  { id: "educational", name: "Educational", icon: "graduationCap" },
  { id: "listicle", name: "Listicle", icon: "list" },
  { id: "story", name: "Story", icon: "book" },
  { id: "tutorial", name: "Tutorial", icon: "check" },
  { id: "promo", name: "Promotional", icon: "megaphone" },
  { id: "case_study", name: "Case Study", icon: "chart" },
] as const;

// Font families — system/web-safe stacks only (no external font loading, so
// nothing to fetch and no CSP concerns). `stack` drives both the DOM (inline
// fontFamily) and the canvas export.
const FONTS = [
  { id: "sans", name: "Sans", stack: "-apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "serif", name: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", name: "Mono", stack: "ui-monospace, Menlo, Consolas, monospace" },
  { id: "condensed", name: "Condensed", stack: "'Arial Narrow', 'Roboto Condensed', sans-serif" },
  { id: "rounded", name: "Rounded", stack: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: "impact", name: "Impact", stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
] as const;

// Text color/effect treatment. `className` styles the DOM; `fill`/`effect` drive
// the canvas export so a downloaded slide matches. Any style can pair with any
// background chip (bgEnabled/bgColor is separate, per layer).
const TEXT_STYLES = [
  { id: "shadow", name: "Shadow", className: "text-white [text-shadow:0_0.06em_0_rgba(0,0,0,0.85)]", fill: "#ffffff", effect: "shadow" },
  { id: "light", name: "Light", className: "text-white", fill: "#ffffff", effect: "none" },
  { id: "dark", name: "Dark", className: "text-ink", fill: "#1c1c1e", effect: "none" },
  {
    id: "outline",
    name: "Outline",
    className:
      "text-white [text-shadow:-0.035em_-0.035em_0_#000,0.035em_-0.035em_0_#000,-0.035em_0.035em_0_#000,0.035em_0.035em_0_#000]",
    fill: "#ffffff",
    effect: "outline",
  },
  { id: "pop", name: "Pop", className: "text-[#ffd63b] [text-shadow:0_0.06em_0_rgba(0,0,0,0.9)]", fill: "#ffd63b", effect: "shadow" },
] as const;

// Font size is stored as a container-query width unit (cqw = 1% of the slide
// frame's width) so the overlay scales with the frame — same relative size in
// the small grid card and the big expand modal. Presets seed the slider.
const TEXT_SIZE_PRESETS = [
  { id: "small", name: "Small", scale: 6 },
  { id: "medium", name: "Medium", scale: 8 },
  { id: "large", name: "Large", scale: 10.5 },
] as const;
const TEXT_SCALE_MIN = 4;
const TEXT_SCALE_MAX = 14;
const TEXT_SCALE_DEFAULT = 8;
const TEXT_BG_COLOR_DEFAULT = "#000000";
const TEXT_BG_OPACITY_DEFAULT = 100;

// A single draggable/resizable text box on a slide. x/y are the CENTER as a
// percent of the frame; width is a percent of the frame width (text wraps to a
// new row when it hits that width). Style is per-layer.
type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  scale: number;
  font: string;
  style: string;
  /** Text fill color — independent of `style`, which now only drives the
   *  shadow/outline/none effect. Falls back to the style's own default fill
   *  for layers saved before this field existed. */
  color?: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number; // 0-100
};
type TextLayerDefaults = Pick<TextLayer, "width" | "scale" | "font" | "style" | "color" | "bgEnabled" | "bgColor" | "bgOpacity">;
const DEFAULT_TEXT_LAYER_SETTINGS = {
  x: 50,
  y: 50,
  width: 64,
  scale: TEXT_SCALE_DEFAULT,
  font: "sans",
  style: "shadow",
  color: "#ffffff",
  bgEnabled: true,
  bgColor: TEXT_BG_COLOR_DEFAULT,
  bgOpacity: TEXT_BG_OPACITY_DEFAULT,
} satisfies Pick<TextLayer, "x" | "y"> & TextLayerDefaults;
const LAYER_WIDTH_MIN = 15;
const LAYER_WIDTH_MAX = 96;
function makeLayer(text = "", overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: crypto.randomUUID(),
    text,
    ...DEFAULT_TEXT_LAYER_SETTINGS,
    ...overrides,
  };
}
function layerFont(layer: TextLayer) {
  return FONTS.find((f) => f.id === layer.font) ?? FONTS[0];
}
function layerStyle(layer: TextLayer) {
  return TEXT_STYLES.find((s) => s.id === layer.style) ?? TEXT_STYLES[0];
}
// hex -> "rgba(r, g, b, a)" so the background chip can be translucent without
// the CSS `opacity` property also fading the text drawn on top of it.
function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16) || 0;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacityPercent, 0, 100) / 100})`;
}

// Quick-start templates for the Templates wizard grid. Thumbnails are branded
// gradient placeholders (real preview images can plug in via `image` later).
// ponytail: static preset list — swap for a fetched template catalog when one exists.
type SlideCategoryId = (typeof SLIDE_CATEGORIES)[number]["id"];
type QuickTemplate = {
  id: string;
  title: string;
  desc: string;
  category: SlideCategoryId;
  slides: number;
  emoji: string;
  tone: string;
};
const QUICK_TEMPLATES: QuickTemplate[] = [
  { id: "productivity", title: "5 Productivity Tips", desc: "A punchy listicle that hooks on slide one.", category: "listicle", slides: 5, emoji: "⚡", tone: "from-amber-100 via-white to-primary-soft" },
  { id: "myth-fact", title: "Myth vs Fact", desc: "Bust a common myth, slide by slide.", category: "educational", slides: 6, emoji: "🧠", tone: "from-sky-100 via-white to-primary-soft" },
  { id: "before-after", title: "Before & After", desc: "A transformation story with a strong payoff.", category: "story", slides: 4, emoji: "✨", tone: "from-rose-100 via-white to-primary-soft" },
  { id: "recipe", title: "Step-by-Step Recipe", desc: "A cookbook-style tutorial people save.", category: "tutorial", slides: 5, emoji: "🍳", tone: "from-orange-100 via-white to-primary-soft" },
  { id: "launch", title: "Product Launch", desc: "Announce a drop with a clear call to action.", category: "promo", slides: 4, emoji: "🚀", tone: "from-violet-100 via-white to-primary-soft" },
  { id: "case-study", title: "Case Study Breakdown", desc: "Show the result, then how you got there.", category: "case_study", slides: 6, emoji: "📈", tone: "from-emerald-100 via-white to-primary-soft" },
  { id: "habits", title: "Daily Habits", desc: "Small habits, one per slide.", category: "educational", slides: 7, emoji: "🌱", tone: "from-lime-100 via-white to-primary-soft" },
  { id: "budget-travel", title: "Travel on a Budget", desc: "Destination tips that feel aspirational.", category: "listicle", slides: 5, emoji: "🌍", tone: "from-cyan-100 via-white to-primary-soft" },
];

type CropOffset = { x: number; y: number };
const DEFAULT_CROP: CropOffset = { x: 0.5, y: 0.5 };
type RefImage = { id: string; url: string; name: string; mediaId?: string; crop?: CropOffset };
type PlatformSlideData = {
  sources: string[];
  uploads: (RefImage | undefined)[];
  layers: TextLayer[][]; // per-slide list of text boxes
};
type StudioMode = "choose" | "custom" | "templates";

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
          // z-50: must clear the slide grid's own absolutely-positioned buttons
          // (z-30) — same z-index would fall back to DOM order, and this
          // popover's trigger sits above the grid in markup, so it'd lose.
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

function CreditBadge({ credits, active }: { credits: number; active?: boolean }) {
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold ${active ? "bg-primary text-white" : "bg-page text-muted"}`}>
      {credits}cr
    </span>
  );
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
              <span
                className={`text-xs font-black uppercase tracking-[0.12em] ${
                  active ? "text-primary-deep" : done ? "text-ink" : "text-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`mx-4 mb-8 h-0.5 flex-1 rounded-full sm:mx-8 ${done ? "bg-primary" : "bg-line"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToolbarButton({
  open,
  icon,
  muted,
  children,
}: {
  open: boolean;
  icon: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
        open ? "border-primary bg-primary-soft/50 text-primary-deep" : "border-line bg-white text-ink hover:border-primary"
      }`}
    >
      <Icon name={icon} size={15} className={muted ? "text-muted" : "text-primary"} />
      {children}
      <Icon name="chevronsUpDown" size={14} className="text-muted" />
    </span>
  );
}

function flagForLanguage(id: string) {
  return LANGUAGES.find((l) => l.id === id)?.flag ?? "🌐";
}

function platformFromSlideshowUrl(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("instagram.com")) return "Instagram";
  if (lower.includes("tiktok.com")) return "TikTok";
  return "TikTok or Instagram";
}

function referencePlatformIconId(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("tiktok.com")) return "tiktok";
  return null;
}

function aspectClass(aspect: (typeof ASPECTS)[number]["id"]) {
  switch (aspect) {
    case "1:1":
      return "aspect-square";
    case "2:3":
      return "aspect-[2/3]";
    case "4:5":
      return "aspect-[4/5]";
    case "16:9":
      return "aspect-[16/9]";
    case "9:16":
    default:
      return "aspect-[9/16]";
  }
}

// width / height, e.g. "9:16" -> 0.5625. Used to size the expand modal so it
// fits both viewport axes without distorting the aspect.
function aspectRatioValue(aspect: (typeof ASPECTS)[number]["id"]) {
  const [w, h] = aspect.split(":").map(Number);
  return h ? w / h : 1;
}

// Anchored via a portal (fixed position), same as SlideSourceControl — the
// generic Popover's absolutely-positioned panel can end up painted behind the
// slide grid's own absolutely-positioned (z-30) +/expand buttons depending on
// stacking context, since it isn't a sibling of what it needs to sit above. A
// portal to <body> sidesteps that entirely instead of chasing z-index values.
function AspectLegendPopover() {
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
        className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
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
            className="z-40 w-[20rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line bg-white p-2 shadow-[0_18px_40px_rgba(6,63,59,0.16)]"
          >
            <p className="px-1.5 py-1 text-xs font-bold uppercase tracking-wide text-muted">Recommended photo format by placement</p>
            {PHOTO_PRESETS.map((preset) => (
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
          document.body,
        )}
    </>
  );
}

/* ------------------------- per-slide source control ------------------------ */

// Anchored via a portal (fixed position) rather than the shared Popover, because
// slide cards live in a horizontally-scrolling row: an absolutely-positioned
// menu inside `overflow-x-auto` gets clipped (overflow-x set also computes
// overflow-y to auto). Closes itself if that row scrolls so it never drifts
// away from its trigger.
function SlideSourceControl({
  value,
  onChange,
  aspect,
}: {
  value: string;
  onChange: (id: string) => void;
  aspect: (typeof ASPECTS)[number]["id"];
}) {
  const recommendedPx = ASPECTS.find((a) => a.id === aspect)?.px;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = SLIDE_SOURCES.find((s) => s.id === value) ?? SLIDE_SOURCES[0];

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
    // capture=true so this also fires for scrolls on the slides row, which
    // doesn't otherwise bubble a scroll event up to window.
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
      setPos({ top: r.bottom + 6, left: r.left });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-extrabold text-primary-deep transition-colors hover:border-primary"
      >
        <Icon name={selected.icon} size={13} />
        {selected.short}
        <Icon name="chevronDown" size={12} className="text-muted" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-40 w-64 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-[0_18px_40px_rgba(6,63,59,0.16)]"
          >
            {SLIDE_SOURCES.map((s) => (
              <MenuRow
                key={s.id}
                active={s.id === value}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
              >
                <Icon name={s.icon} size={16} className={s.id === value ? "text-primary-deep" : "text-muted"} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {s.id === "upload" && recommendedPx ? `Recommended: ${recommendedPx}` : s.desc}
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {"credits" in s && <CreditBadge credits={s.credits} active={s.id === value} />}
                  {s.id === value && <Icon name="check" size={15} className="text-primary-deep" />}
                </span>
              </MenuRow>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Set arr[index] = value, growing the array with `fill` if it's too short.
// A plain arr.map() silently drops the write when index is past the end (which
// happens if the per-slide arrays ever drift out of length sync), so writes go
// through this instead.
function setAt<T>(arr: T[], index: number, value: T, fill: T): T[] {
  const next = arr.slice();
  while (next.length <= index) next.push(fill);
  next[index] = value;
  return next;
}

/** One draggable/resizable/inline-editable text box on a slide. Encapsulates
 *  its own edit state so React never fights the contentEditable caret. */
function LayerView({
  layer,
  editable,
  selected,
  frameRef,
  onSelect,
  onChange,
  onDelete,
}: {
  layer: TextLayer;
  editable: boolean;
  selected: boolean;
  frameRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (patch: Partial<TextLayer>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const resizing = useRef(false);

  // Seed the editable node once when entering edit mode, then leave it
  // uncontrolled so typing doesn't reset the caret.
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

  const st = layerStyle(layer);
  const font = layerFont(layer);
  const hasText = layer.text.trim().length > 0;

  function onMoveDown(e: React.PointerEvent) {
    if (!editable || editing) return;
    e.stopPropagation();
    onSelect();
    const frame = frameRef.current;
    if (!frame) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = frame.getBoundingClientRect();
    const cx = r.left + (layer.x / 100) * r.width;
    const cy = r.top + (layer.y / 100) * r.height;
    grab.current = { dx: e.clientX - cx, dy: e.clientY - cy };
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
    onChange({
      x: halfW >= 50 ? 50 : clamp(x, halfW, 100 - halfW),
      y: halfH >= 50 ? 50 : clamp(y, halfH, 100 - halfH),
    });
  }
  function onMoveUp(e: React.PointerEvent) {
    grab.current = null;
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
  function onResizeUp(e: React.PointerEvent) {
    resizing.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  return (
    <div
      ref={boxRef}
      style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, transform: "translate(-50%, -50%)" }}
      className={`absolute z-20 touch-none px-1 text-center ${
        selected && editable ? "rounded outline outline-2 outline-primary outline-offset-2" : ""
      }`}
      onPointerDown={onMoveDown}
      onPointerMove={onMoveMove}
      onPointerUp={onMoveUp}
      onPointerCancel={onMoveUp}
      onDoubleClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        onSelect();
        setEditing(true);
      }}
    >
      <div
        ref={editRef}
        contentEditable={editing}
        suppressContentEditableWarning
        onInput={(e) => onChange({ text: e.currentTarget.innerText.slice(0, SLIDE_TEXT_MAX) })}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.target as HTMLElement).blur();
        }}
        style={{
          fontSize: `${layer.scale}cqw`,
          fontFamily: font.stack,
          color: layer.color || st.fill,
          ...(layer.bgEnabled ? { backgroundColor: hexToRgba(layer.bgColor, layer.bgOpacity ?? 100) } : {}),
        }}
        className={`inline-block whitespace-pre-wrap break-words rounded px-[0.3em] py-[0.12em] font-black leading-tight outline-none ${st.className} ${
          hasText || editing ? "" : "italic"
        } ${editing ? "cursor-text" : editable ? "cursor-grab select-none active:cursor-grabbing" : "select-none"}`}
      >
        {editing ? undefined : hasText ? layer.text : editable ? "Double click to edit text" : ""}
      </div>
      {selected && editable && !editing && (
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
            aria-label="Delete text"
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

/** The image (or placeholder) plus every text layer. Interactive when
 *  `editable`; a static render for the review step otherwise. */
function LayeredSlideFrame({
  index,
  source,
  uploadedImage,
  aspect,
  show,
  layers,
  editable = false,
  selectedId,
  onSelect,
  onChangeLayer,
  onDeleteLayer,
  className,
}: {
  index: number;
  source: string;
  uploadedImage?: RefImage;
  aspect: (typeof ASPECTS)[number]["id"];
  show: boolean;
  layers: TextLayer[];
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChangeLayer?: (id: string, patch: Partial<TextLayer>) => void;
  onDeleteLayer?: (id: string) => void;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={frameRef}
      // [container-type:inline-size] makes the frame a query container so each
      // layer's cqw font-size scales with the frame width (same relative size
      // small or expanded).
      onPointerDown={editable ? () => onSelect?.(null) : undefined}
      className={`group relative w-full overflow-hidden rounded-xl border border-primary/15 bg-white [container-type:inline-size] ${aspectClass(
        aspect,
      )} ${className ?? ""}`}
    >
      {source === "upload" && uploadedImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview.
        <img
          src={uploadedImage.url}
          alt={uploadedImage.name}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${(uploadedImage.crop?.x ?? DEFAULT_CROP.x) * 100}% ${(uploadedImage.crop?.y ?? DEFAULT_CROP.y) * 100}%` }}
        />
      ) : (
        // Light, modern "empty slot" placeholder: soft mint gradient + a small
        // centered icon mark, rather than a heavy dark fill. The "shadow" text
        // style (default) stays legible on light backgrounds too — the drop
        // shadow provides its own contrast edge independent of the backdrop.
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-white to-[#dcefe9]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(14,129,119,0.12),transparent_45%)]" />
          <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-primary shadow-sm ring-1 ring-primary/10">
            <Icon name="image" size={18} />
          </span>
          <span className="relative z-10 text-[10px] font-black uppercase tracking-[0.25em] text-primary-deep/40">
            Post Train
          </span>
        </div>
      )}
      {show &&
        layers.map((layer) => (
          <LayerView
            key={layer.id}
            layer={layer}
            editable={editable}
            selected={selectedId === layer.id}
            frameRef={frameRef}
            onSelect={() => onSelect?.(layer.id)}
            onChange={(patch) => onChangeLayer?.(layer.id, patch)}
            onDelete={() => onDeleteLayer?.(layer.id)}
          />
        ))}
      <span className="absolute bottom-2 right-2 z-30 flex h-6 w-6 items-center justify-center rounded-md bg-ink/70 text-xs font-black text-white">
        {index + 1}
      </span>
    </div>
  );
}

/** Choose the focal point for an uploaded photo before it is committed to a
 * slide. The highlighted window mirrors CSS object-fit: cover exactly. */
function ImageCropModal({
  imageUrl,
  imageName,
  targetAspect,
  platformLabel,
  stepLabel,
  actionLabel,
  initial = DEFAULT_CROP,
  onCancel,
  onSave,
}: {
  imageUrl: string;
  imageName: string;
  targetAspect: number;
  platformLabel: string;
  stepLabel?: string;
  actionLabel: string;
  initial?: CropOffset;
  onCancel: () => void;
  onSave: (crop: CropOffset) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [crop, setCrop] = useState(initial);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; value: number } | null>(null);
  useEffect(() => setMounted(true), []);

  const imageAspect = imageSize ? imageSize.width / imageSize.height : targetAspect;
  const axis: "x" | "y" | "none" = imageAspect > targetAspect + 0.005 ? "x" : imageAspect < targetAspect - 0.005 ? "y" : "none";
  const cropWidth = axis === "x" ? (targetAspect / imageAspect) * 100 : 100;
  const cropHeight = axis === "y" ? (imageAspect / targetAspect) * 100 : 100;
  const left = axis === "x" ? (100 - cropWidth) * crop.x : 0;
  const top = axis === "y" ? (100 - cropHeight) * crop.y : 0;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (axis === "none") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, value: axis === "x" ? crop.x : crop.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !frameRef.current || axis === "none") return;
    const rect = frameRef.current.getBoundingClientRect();
    const travel = axis === "x" ? rect.width * (1 - cropWidth / 100) : rect.height * (1 - cropHeight / 100);
    if (travel <= 0) return;
    const delta = axis === "x" ? e.clientX - dragRef.current.x : e.clientY - dragRef.current.y;
    const value = Math.min(1, Math.max(0, dragRef.current.value + delta / travel));
    setCrop((current) => (axis === "x" ? { ...current, x: value } : { ...current, y: value }));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture can already be released by the browser.
    }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/55 p-4" role="dialog" aria-modal="true" aria-label="Reposition image crop">
      <div className="card w-full max-w-2xl p-5 shadow-[0_24px_60px_rgba(6,63,59,0.26)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-extrabold text-ink">Reposition crop</p>
            <p className="mt-1 text-sm text-muted">
              {stepLabel ? `${stepLabel} · ` : ""}{platformLabel} · Drag the frame to choose what stays visible.
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel crop" className="text-muted transition-colors hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="mt-5 flex justify-center">
          <div
            ref={frameRef}
            className="relative max-h-[58vh] w-full max-w-[560px] touch-none select-none overflow-hidden rounded-xl bg-ink"
            style={{ aspectRatio: imageAspect }}
          >
            <img
              src={imageUrl}
              alt={imageName}
              className="pointer-events-none h-full w-full object-contain"
              onLoad={(e) => setImageSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            />
            {axis !== "none" && (
              <div
                className="absolute border-2 border-white"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${cropWidth}%`,
                  height: `${cropHeight}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.58)",
                  cursor: axis === "x" ? "ew-resize" : "ns-resize",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            )}
          </div>
        </div>
        {axis === "none" && <p className="mt-3 text-center text-sm text-muted">This image already fits this format exactly.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-subtle" onClick={() => setCrop(DEFAULT_CROP)}>
            <Icon name="refresh" size={14} /> Center
          </button>
          <button type="button" className="btn-subtle" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => onSave(crop)}>
            {actionLabel} <Icon name="chevronRight" size={15} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Full-screen editor for a slide — a much bigger canvas for precise layer
 *  work. Edits commit live (there's no separate save step for layers). */
function SlideExpandModal({
  index,
  source,
  uploadedImage,
  aspect,
  layers,
  onChangeLayer,
  onDeleteLayer,
  onAddLayer,
  onClose,
}: {
  index: number;
  source: string;
  uploadedImage?: RefImage;
  aspect: (typeof ASPECTS)[number]["id"];
  layers: TextLayer[];
  onChangeLayer: (id: string, patch: Partial<TextLayer>) => void;
  onDeleteLayer: (id: string) => void;
  onAddLayer: () => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(layers[0]?.id ?? null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ar = aspectRatioValue(aspect);
  const frameWidth = `min(92vw, ${(74 * ar).toFixed(2)}vh)`;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full flex-col items-center gap-3"
        style={{ width: frameWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <p className="text-sm font-bold text-white">Slide {index + 1}</p>
          <span className="text-xs font-medium text-white/70">
            Double-click a text to edit · drag to move · drag the dot to resize
          </span>
        </div>
        <LayeredSlideFrame
          index={index}
          source={source}
          uploadedImage={uploadedImage}
          aspect={aspect}
          show
          editable
          layers={layers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChangeLayer={onChangeLayer}
          onDeleteLayer={(id) => {
            onDeleteLayer(id);
            setSelectedId(null);
          }}
          className="shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
        />
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAddLayer}
            className="flex items-center gap-1 rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-white/20"
          >
            <Icon name="type" size={14} /> Add text
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-primary-deep"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SlideStructureCard({
  index,
  source,
  onSourceChange,
  uploadedImage,
  aspect,
  show,
  layers,
  selectedLayerId,
  onSelectLayer,
  onChangeLayer,
  onAddLayer,
  onDeleteLayer,
  onApplyToAll,
  uploading,
}: {
  index: number;
  source: string;
  onSourceChange: (id: string) => void;
  uploadedImage?: RefImage;
  aspect: (typeof ASPECTS)[number]["id"];
  show: boolean;
  layers: TextLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onChangeLayer: (id: string, patch: Partial<TextLayer>) => void;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
  /** Present only when there's more than one platform to sync this slide's layers to. */
  onApplyToAll?: () => void;
  /** True while this slide's uploaded photo is being saved to storage. */
  uploading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    // Sizing comes entirely from the parent grid's column count (see
    // slideGridColumns) — this just fills its grid cell.
    <div className="flex flex-col gap-2" data-keep-selection>
      <div className="relative">
        <LayeredSlideFrame
          index={index}
          source={source}
          uploadedImage={uploadedImage}
          aspect={aspect}
          show={show}
          editable
          layers={layers}
          selectedId={selectedLayerId}
          onSelect={onSelectLayer}
          onChangeLayer={onChangeLayer}
          onDeleteLayer={onDeleteLayer}
        />
        {uploading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-ink/50 text-white">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
            <span className="text-[11px] font-bold">Saving photo…</span>
          </div>
        )}
        {show && (
          <div className="absolute right-2 top-2 z-30 flex gap-1">
            <button
              type="button"
              onClick={onAddLayer}
              title="Add a text box"
              aria-label="Add a text box"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/70 text-white transition-colors hover:bg-ink/90"
            >
              <Icon name="type" size={14} />
            </button>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Expand to edit text precisely"
              aria-label="Expand to edit text precisely"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/70 text-white transition-colors hover:bg-ink/90"
            >
              <Icon name="expand" size={14} />
            </button>
          </div>
        )}
      </div>
      <SlideSourceControl value={source} onChange={onSourceChange} aspect={aspect} />
      {onApplyToAll && (
        <button
          type="button"
          onClick={onApplyToAll}
          title={`Copy this slide's text to slide ${index + 1} on every other platform`}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-bold text-muted transition-colors hover:border-primary hover:text-primary-deep"
        >
          <Icon name="copy" size={11} /> Apply to every Slide {index + 1}
        </button>
      )}
      {expanded && (
        <SlideExpandModal
          index={index}
          source={source}
          uploadedImage={uploadedImage}
          aspect={aspect}
          layers={layers}
          onChangeLayer={onChangeLayer}
          onDeleteLayer={onDeleteLayer}
          onAddLayer={onAddLayer}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

/** Read-only slide render for the launch preview — image + layers, no editing. */
function SlidePreviewFrame({
  index,
  source,
  uploadedImage,
  aspect,
  show,
  layers,
  className,
}: {
  index: number;
  source: string;
  uploadedImage?: RefImage;
  aspect: (typeof ASPECTS)[number]["id"];
  show: boolean;
  layers: TextLayer[];
  className?: string;
}) {
  return (
    <LayeredSlideFrame
      index={index}
      source={source}
      uploadedImage={uploadedImage}
      aspect={aspect}
      show={show}
      layers={layers}
      className={className}
    />
  );
}

/* ---------------------- slide → PNG download (review) ---------------------- */

// The slides shown on Review are the same DOM that's drawn here to a canvas at
// the platform's recommended pixel size, so a download matches what's on screen
// (placeholder + overlay, or the uploaded photo + overlay).
// ponytail: remote (CDN) upload URLs from a resumed draft can taint the canvas
// and make toBlob throw — caught below, falling back to the placeholder. In-
// session uploads are blob: URLs and export fine. Real AI images aren't wired
// yet, so most slides export as the placeholder.

function parseAspectPx(aspect: (typeof ASPECTS)[number]["id"]) {
  const info = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
  const [w, h] = info.px.replace(/px/i, "").split(/[×x]/).map((n) => parseInt(n.trim(), 10));
  return { w: w || 1080, h: h || 1080 };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Matches the DOM placeholder: light mint gradient + a small centered image-
// icon mark (the same path as the "image" glyph in icons.tsx) + a subtle
// wordmark, instead of the old dark rotated "POST TRAIN" fill.
function drawSlidePlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#e7f6f4"); // primary-soft
  g.addColorStop(0.55, "#ffffff");
  g.addColorStop(1, "#dcefe9");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.25, h * 0.18, 0, w * 0.25, h * 0.18, w * 0.55);
  glow.addColorStop(0, "rgba(14,129,119,0.12)");
  glow.addColorStop(1, "rgba(14,129,119,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const iconSize = w * 0.13;
  const cx = w / 2;
  const cy = h / 2 - iconSize * 0.35;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, iconSize * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, w * 0.0015);
  ctx.strokeStyle = "rgba(14,129,119,0.12)";
  ctx.stroke();

  const iconPath = new Path2D(
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9.5 8.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM21 15l-5-5L5 21",
  );
  const scale = (iconSize * 0.6) / 24;
  ctx.translate(cx - 12 * scale, cy - 12 * scale);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#0e8177"; // primary
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.8 / scale;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(iconPath);
  ctx.restore();

  ctx.fillStyle = "rgba(10,95,89,0.4)"; // primary-deep
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${w * 0.028}px -apple-system, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillText("P O S T   T R A I N", cx, cy + iconSize * 0.62 + w * 0.05);
}

// Draw one text layer, matching the DOM: cqw font size, per-layer width wrap,
// center anchor, optional bg chip, and the style's fill/effect.
function drawLayer(ctx: CanvasRenderingContext2D, w: number, h: number, layer: TextLayer) {
  if (!layer.text.trim()) return;
  const st = layerStyle(layer);
  const font = layerFont(layer);
  const fontSize = (layer.scale / 100) * w; // cqw
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
  const lineHeight = fontSize * 1.25; // leading-tight
  const blockH = lines.length * lineHeight;
  const cx = (layer.x / 100) * w;
  const cy = (layer.y / 100) * h;
  const topY = cy - blockH / 2;

  if (layer.bgEnabled) {
    let maxLineW = 0;
    for (const ln of lines) maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
    const boxW = maxLineW + pad * 2;
    const boxH = blockH + pad * 0.4;
    ctx.fillStyle = hexToRgba(layer.bgColor, layer.bgOpacity ?? 100);
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, topY - pad * 0.2, boxW, boxH, fontSize * 0.15);
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

async function renderSlideBlob(opts: {
  aspect: (typeof ASPECTS)[number]["id"];
  source: string;
  uploadedImage?: RefImage;
  show: boolean;
  layers: TextLayer[];
}): Promise<Blob> {
  const { w, h } = parseAspectPx(opts.aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  if (opts.source === "upload" && opts.uploadedImage) {
    try {
      const img = await loadImage(opts.uploadedImage.url);
      const scale = Math.max(w / img.width, h / img.height); // object-cover
      const dw = img.width * scale;
      const dh = img.height * scale;
      const crop = opts.uploadedImage.crop ?? DEFAULT_CROP;
      ctx.drawImage(img, (w - dw) * crop.x, (h - dh) * crop.y, dw, dh);
    } catch {
      drawSlidePlaceholder(ctx, w, h);
    }
  } else {
    drawSlidePlaceholder(ctx, w, h);
  }

  if (opts.show) for (const layer of opts.layers) drawLayer(ctx, w, h, layer);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Slide render failed"))), "image/png"),
  );
}

/* -------------------------------- mode chooser ------------------------------- */

function ModeCard({
  onClick,
  icon,
  badge,
  title,
  desc,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  badge?: string;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-start gap-4 rounded-2xl border border-line bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_18px_40px_rgba(6,63,59,0.14)]"
    >
      {badge && (
        <span className="absolute right-4 top-4 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-black uppercase tracking-wide text-primary-deep">
          {badge}
        </span>
      )}
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-deep transition-colors group-hover:bg-primary group-hover:text-white">
        {icon}
      </span>
      <div>
        <h3 className="text-lg font-black text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{desc}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-bold text-primary-deep">
        Get started <Icon name="chevronRight" size={15} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function ModeChooser({
  onTemplates,
  onCustom,
  onCopy,
}: {
  onTemplates: () => void;
  onCustom: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="card mt-5 p-6 sm:p-8">
      <div className="max-w-xl">
        <h2 className="text-xl font-black text-ink">How do you want to start?</h2>
        <p className="mt-1 text-sm text-muted">
          Pick a starting point — you can change any setting later.
        </p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <ModeCard
          onClick={onTemplates}
          badge="Recommended"
          icon={<Icon name="stack" size={26} />}
          title="Templates"
          desc="Start from a proven layout and customize it in a guided, step-by-step flow."
        />
        <ModeCard
          onClick={onCustom}
          icon={<Icon name="pencil" size={26} />}
          title="Custom"
          desc="Build from scratch — set the structure, style, and context yourself."
        />
        <ModeCard
          onClick={onCopy}
          icon={
            <span className="flex items-center gap-1">
              <PlatformIcon id="instagram" size={20} />
              <PlatformIcon id="tiktok" size={20} />
            </span>
          }
          title="Copy from IG or TikTok"
          desc="Paste a photo-post link and recreate its structure as a new slideshow."
        />
      </div>
    </div>
  );
}

/* --------------------------------- drafts ------------------------------------- */

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function DraftOriginTag({ mode, platform }: { mode: StudioDraftMode; platform: string | null }) {
  if (mode === "copy") {
    const iconId = platform === "Instagram" ? "instagram" : platform === "TikTok" ? "tiktok" : null;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary-deep">
        {iconId && <PlatformIcon id={iconId} size={11} />}
        Template
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-page px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted">
      <Icon name={mode === "templates" ? "stack" : "pencil"} size={11} />
      {mode === "templates" ? "Template" : "Custom"}
    </span>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <h2 className="text-lg font-black text-ink">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-subtle !py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DraftsSection({
  drafts,
  loading,
  onResume,
  onDelete,
}: {
  drafts: StudioDraftRow[];
  loading: boolean;
  onResume: (draft: StudioDraftRow) => void;
  onDelete: (id: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<StudioDraftRow | null>(null);
  return (
    <div className="card mt-5 p-6 sm:p-8">
      <h3 className="text-xs font-black uppercase tracking-[0.1em] text-muted">Drafts</h3>
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
          Loading drafts…
        </div>
      ) : !drafts.length ? (
        <p className="mt-4 text-sm font-semibold text-muted">No saved drafts.</p>
      ) : (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            role="button"
            tabIndex={0}
            onClick={() => onResume(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onResume(draft);
              }
            }}
            className="group relative flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/30"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-page">
              {draft.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- external reference-photo preview
                <img src={draft.cover_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon name="stack" size={18} className="text-muted" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">{draft.title}</span>
              <span className="mt-1 flex items-center gap-2">
                <DraftOriginTag mode={draft.mode} platform={draft.source_platform} />
                <span className="text-xs font-semibold text-muted">{relativeTime(draft.updated_at)}</span>
              </span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(draft);
              }}
              aria-label={`Delete draft ${draft.title}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-ink/10 hover:text-ink group-hover:opacity-100"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this draft?"
        message={`"${pendingDelete?.title || "Untitled draft"}" will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/* ------------------------------- templates step ------------------------------ */

function TemplateThumb({ template }: { template: QuickTemplate }) {
  return (
    <div className={`relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${template.tone}`}>
      <span className="text-5xl drop-shadow-sm">{template.emoji}</span>
      <span className="absolute bottom-2 left-2 rounded-md bg-white/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary-deep shadow-sm">
        {template.slides} slides
      </span>
    </div>
  );
}

function TemplatesStep({
  selected,
  onSelect,
  onCopy,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  onCopy: () => void;
}) {
  const [tab, setTab] = useState<"quick" | "mine" | "styles">("quick");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | SlideCategoryId>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return QUICK_TEMPLATES.filter(
      (t) =>
        (category === "all" || t.category === category) &&
        (!q || t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)),
    );
  }, [query, category]);

  const activeCategory = SLIDE_CATEGORIES.find((c) => c.id === category);

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-page p-1">
          {(
            [
              ["quick", "Quick Start"],
              ["mine", "My Templates"],
              ["styles", "Your Styles"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                tab === id ? "bg-white text-primary-deep shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {label}
              {id === "quick" && (
                <span className="ml-1.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-xs text-primary-deep">
                  {QUICK_TEMPLATES.length}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab === "quick" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input !w-56 !pl-9"
                placeholder="Search templates…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Popover
              align="right"
              width="min-w-[15rem]"
              trigger={(open) => (
                <ToolbarButton open={open} icon={activeCategory?.icon ?? "filter"} muted={category === "all"}>
                  {activeCategory?.name ?? "All Categories"}
                </ToolbarButton>
              )}
            >
              {(close) => (
                <>
                  <MenuRow active={category === "all"} onClick={() => { setCategory("all"); close(); }}>
                    <Icon name="filter" size={16} className={category === "all" ? "text-primary-deep" : "text-muted"} />
                    <span className="font-semibold">All Categories</span>
                    {category === "all" && <Icon name="check" size={15} className="ml-auto text-primary-deep" />}
                  </MenuRow>
                  {SLIDE_CATEGORIES.map((c) => (
                    <MenuRow key={c.id} active={category === c.id} onClick={() => { setCategory(c.id); close(); }}>
                      <Icon name={c.icon} size={16} className={category === c.id ? "text-primary-deep" : "text-muted"} />
                      <span className="font-semibold">{c.name}</span>
                      {category === c.id && <Icon name="check" size={15} className="ml-auto text-primary-deep" />}
                    </MenuRow>
                  ))}
                </>
              )}
            </Popover>
          </div>
        )}
      </div>

      {tab === "quick" ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {/* Copy style & automate */}
          <button
            type="button"
            onClick={onCopy}
            className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
          >
            <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-page text-muted transition-colors group-hover:text-primary-deep">
              <Icon name="copy" size={26} />
              <span className="text-xs font-black uppercase tracking-wide">Copy style</span>
            </div>
            <div className="p-2.5">
              <p className="text-sm font-bold text-ink">Copy style & automate</p>
              <p className="mt-0.5 text-xs text-muted">Paste a TikTok link, keep the style</p>
            </div>
          </button>

          {/* Start from scratch */}
          <button
            type="button"
            onClick={() => onSelect("scratch")}
            className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
              selected === "scratch" ? "border-primary ring-2 ring-primary/40" : "border-line bg-white hover:border-primary"
            }`}
          >
            <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-page text-muted transition-colors group-hover:text-primary-deep">
              <Icon name="sparkles" size={26} />
              <span className="text-xs font-black uppercase tracking-wide">From scratch</span>
            </div>
            <div className="p-2.5">
              <p className="text-sm font-bold text-ink">Start from Scratch</p>
              <p className="mt-0.5 text-xs text-muted">Configure everything yourself</p>
            </div>
          </button>

          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                selected === t.id ? "border-primary ring-2 ring-primary/40" : "border-line bg-white hover:border-primary"
              }`}
            >
              <div className="p-1.5 pb-0">
                <TemplateThumb template={t} />
              </div>
              <div className="p-2.5">
                <p className="truncate text-sm font-bold text-ink">{t.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.desc}</p>
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-line bg-page/40 px-6 py-12 text-center text-sm text-muted">
              No templates match “{query.trim()}”. Try a different search or category.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-page/40 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-deep">
            <Icon name={tab === "mine" ? "stack" : "image"} size={22} />
          </span>
          <p className="max-w-sm text-sm text-muted">
            {tab === "mine"
              ? "You haven't saved any templates yet. Templates you save from a campaign show up here."
              : "Styles you create from reference images or links will appear here."}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- copy modal ------------------------------- */

function CopySlideshowModal({
  open,
  link,
  onLinkChange,
  onClose,
  onFetch,
  busy,
  error,
  acknowledged,
  onAcknowledgedChange,
}: {
  open: boolean;
  link: string;
  onLinkChange: (value: string) => void;
  onClose: () => void;
  onFetch: () => void;
  busy: boolean;
  error: string;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}) {
  if (!open) return null;
  const platform = platformFromSlideshowUrl(link);
  const canFetch = /^https?:\/\/.+/i.test(link.trim()) && acknowledged && !busy;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <Icon name="copy" size={25} />
            </span>
            <div>
              <h2 className="text-xl font-black text-ink">Copy {platform} Slideshow</h2>
              <p className="mt-0.5 text-xs font-black uppercase tracking-[0.18em] text-muted">
                Paste a public link — we read the caption &amp; cover, then draft your context
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-page hover:text-ink"
            aria-label="Close copy slideshow"
          >
            <Icon name="x" size={22} />
          </button>
        </div>

        <div className="px-6 py-6">
          <p className="max-w-2xl text-lg font-medium leading-relaxed text-muted">
            Paste a <span className="font-bold text-ink">public</span> TikTok or Instagram photo/slideshow link.
            We’ll pull the caption and cover image and turn them into an editable context brief.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Icon
                name="link"
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                className="input h-14 !rounded-xl !pl-11 text-lg"
                autoFocus
                disabled={busy}
                placeholder="https://www.tiktok.com/... or https://www.instagram.com/..."
                value={link}
                onChange={(e) => onLinkChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canFetch) onFetch();
                }}
              />
            </div>
            <button
              type="button"
              disabled={!canFetch}
              onClick={onFetch}
              className="btn-primary h-14 min-w-[120px] justify-center text-base disabled:opacity-50"
            >
              {busy ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
              ) : (
                "Fetch"
              )}
            </button>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              <Icon name="warningTriangle" size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Content-responsibility acknowledgment — required before fetching. */}
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-page/50 px-4 py-3">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={busy}
              onChange={(e) => onAcknowledgedChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-primary focus:ring-primary"
            />
            <span className="text-sm leading-relaxed text-muted">
              I confirm the post is public, that I will not reuse the caption or cover image copied from this post
              as-is (only as reference for my own original content), and I agree to Post Train’s{" "}
              <a href="/tos" target="_blank" rel="noreferrer" className="font-bold text-primary-deep underline">
                Terms &amp; Content Policy
              </a>
              . Post Train isn’t responsible for third-party content. Copying private, infringing, or inappropriate
              content may result in suspension or permanent account removal.
            </span>
          </label>

          <p className="mt-3 text-xs font-semibold text-muted">
            Only public posts can be copied — private posts are blocked. We read publicly available data only;
            full multi-slide extraction may require a connected data provider.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type SlideshowAccount = { id: number; platform: string; username: string; avatar_url: string | null };

export function SlideshowStudio({
  initialSlideTexts,
  accounts = [],
  configuredProviders = {},
}: {
  initialSlideTexts?: string[];
  sourceExploreItemId?: string;
  accounts?: SlideshowAccount[];
  configuredProviders?: Partial<Record<ImageGenProvider, boolean>>;
}) {
  // Arriving from Explore "recreate" jumps straight into the Custom editor.
  const [mode, setMode] = useState<StudioMode>(initialSlideTexts ? "custom" : "choose");
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [publishDate, setPublishDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [publishTime, setPublishTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [context, setContext] = useState(initialSlideTexts?.join("\n") ?? "");
  const [contextBusy, setContextBusy] = useState(false);
  const [contextError, setContextError] = useState("");
  // All per-slide arrays derive from this one count so they can never drift
  // out of sync (a shorter array silently drops edits at the missing indexes).
  const initialSlideCount = initialSlideTexts?.length || 5;
  const [slideCount, setSlideCount] = useState(initialSlideCount);
  const [slideSources, setSlideSources] = useState<string[]>(() =>
    Array(initialSlideCount).fill("auto"),
  );
  // Per-slide photos picked via the "Uploaded Images" source — distinct from
  // refImages, which are style/context references and must never be posted as-is.
  const [slideUploads, setSlideUploads] = useState<(RefImage | undefined)[]>(() =>
    Array(initialSlideCount).fill(undefined),
  );
  // Per-slide text overlay boxes ("layers"). Each slide starts with one layer
  // seeded from Explore "recreate" text (if any); users add more with "+".
  const [slideLayers, setSlideLayers] = useState<TextLayer[][]>(() =>
    Array.from({ length: initialSlideCount }, (_, i) => {
      const t = initialSlideTexts?.[i]?.slice(0, SLIDE_TEXT_MAX) ?? "";
      return t.trim() ? [makeLayer(t)] : [];
    }),
  );
  // Which text layer is selected for styling/deletion: { slide index, layer id }.
  const [selectedLayer, setSelectedLayer] = useState<{ slide: number; id: string } | null>(null);
  // Per-platform slide overrides — the primary (first selected) platform's
  // slides live in the arrays above; any other platform shows those same
  // slides until the user edits something while viewing its tab, at which
  // point it gets its own independent copy here. "Apply to all" collapses
  // a single slide's override back across every platform.
  const [platformSlideOverrides, setPlatformSlideOverrides] = useState<Record<string, PlatformSlideData>>({});
  const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);
  const [uploadTargetPlatform, setUploadTargetPlatform] = useState<string | null>(null);
  const [pendingUploadScope, setPendingUploadScope] = useState<{ file: File; index: number; platform: string | null } | null>(null);
  const [pendingCropFlow, setPendingCropFlow] = useState<{
    file: File;
    imageUrl: string;
    index: number;
    platforms: (string | null)[];
    current: number;
    crops: Record<string, CropOffset>;
  } | null>(null);
  const slideUploadInput = useRef<HTMLInputElement>(null);
  // Which slide (for which platform, null = base) is mid-upload to R2, so the
  // grid can show a spinner over it; and the last upload failure, if any.
  const [slideUploadBusy, setSlideUploadBusy] = useState<{ index: number; platform: string | null } | null>(null);
  const [slideUploadError, setSlideUploadError] = useState("");
  // Guards against an older upload finishing after a newer one for the same
  // slide+platform and clobbering it — only the latest token's result commits.
  const uploadTokens = useRef<Record<string, number>>({});
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const refImagesRef = useRef<RefImage[]>([]);
  const [refUploadingIds, setRefUploadingIds] = useState<Set<string>>(new Set());
  const [refUploadError, setRefUploadError] = useState("");
  const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>({});
  const [captionLength, setCaptionLength] = useState<"short" | "medium" | "long">("medium");
  const [previewPlatform, setPreviewPlatform] = useState<string>("");
  const [platformPhotoFormatIds, setPlatformPhotoFormatIds] = useState<Record<string, string>>({});
  const textLayerDefaults = useRef<TextLayerDefaults>({
    width: DEFAULT_TEXT_LAYER_SETTINGS.width,
    scale: DEFAULT_TEXT_LAYER_SETTINGS.scale,
    font: DEFAULT_TEXT_LAYER_SETTINGS.font,
    style: DEFAULT_TEXT_LAYER_SETTINGS.style,
    color: DEFAULT_TEXT_LAYER_SETTINGS.color,
    bgEnabled: DEFAULT_TEXT_LAYER_SETTINGS.bgEnabled,
    bgColor: DEFAULT_TEXT_LAYER_SETTINGS.bgColor,
    bgOpacity: DEFAULT_TEXT_LAYER_SETTINGS.bgOpacity,
  });
  const [downloadingSlide, setDownloadingSlide] = useState<number | null>(null);
  const [captionBusy, setCaptionBusy] = useState<Record<string, boolean>>({});
  const [captionError, setCaptionError] = useState<Record<string, string>>({});

  useEffect(() => {
    refImagesRef.current = refImages;
  }, [refImages]);
  const [toneResults, setToneResults] = useState<Record<string, AiToneResult>>({});
  const [improveBusy, setImproveBusy] = useState<Record<string, boolean>>({});
  const [improveError, setImproveError] = useState<Record<string, string>>({});
  const [aiModel, setAiModel] = useState<(typeof AI_MODELS)[number]["id"]>("nano-banana-2");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]["id"]>("9:16");
  const [overlays, setOverlays] = useState<(typeof OVERLAYS)[number]["id"]>("none");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]["id"]>("en");
  const [slideCategory, setSlideCategory] = useState<SlideCategoryId>("educational");
  const [advancedTextOpen, setAdvancedTextOpen] = useState(true);
  const [translationMode, setTranslationMode] = useState<"same" | (typeof LANGUAGES)[number]["id"]>("same");
  const [slideshowReference, setSlideshowReference] = useState("");
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copyAcknowledged, setCopyAcknowledged] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Saved drafts — shown on the "choose" screen, autosaved while editing.
  const [drafts, setDrafts] = useState<StudioDraftRow[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftOrigin, setDraftOrigin] = useState<StudioDraftMode>("custom");
  const [draftPlatform, setDraftPlatform] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());
  const draftIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Only local object URLs need revoking; copied posts use remote CDN URLs.
    return () => {
      refImages.forEach((r) => r.url.startsWith("blob:") && URL.revokeObjectURL(r.url));
      slideUploads.forEach((r) => r?.url.startsWith("blob:") && URL.revokeObjectURL(r.url));
      Object.values(platformSlideOverrides).forEach((d) =>
        d.uploads.forEach((r) => r?.url.startsWith("blob:") && URL.revokeObjectURL(r.url)),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clicking anywhere outside a slide card or the styling panel clears the
  // selected text layer (so its border disappears). Clicks on a layer stop
  // propagation, so they never reach here.
  useEffect(() => {
    if (!selectedLayer) return;
    function onDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest("[data-keep-selection]")) return;
      setSelectedLayer(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selectedLayer]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/studio/drafts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: StudioDraftRow[] } | null) => {
        // Studio drafts are shared across templates; only surface slideshow ones.
        if (!cancelled && data?.data) setDrafts(data.data.filter((d) => d.template === "slideshow"));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDraftsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAspect = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
  const selectedOverlay = OVERLAYS.find((o) => o.id === overlays) ?? OVERLAYS[0];
  const selectedLanguage = LANGUAGES.find((l) => l.id === language) ?? LANGUAGES[0];
  const selectedCategory = SLIDE_CATEGORIES.find((c) => c.id === slideCategory) ?? SLIDE_CATEGORIES[0];
  const selectedModel = AI_MODELS.find((m) => m.id === aiModel) ?? AI_MODELS[0];
  const showSlideText = overlays === "text";
  const selectedTranslationLanguage =
    translationMode === "same"
      ? selectedLanguage
      : LANGUAGES.find((l) => l.id === translationMode) ?? selectedLanguage;
  const canContinue = campaignName.trim().length > 0 && context.trim().length > 0;
  const isPublishToday = publishDate === new Date().toISOString().slice(0, 10);
  const publishedLabel = useMemo(() => {
    const date = new Date(`${publishDate}T${publishTime}`);
    if (Number.isNaN(date.getTime())) return "Not scheduled";
    const day = isPublishToday ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${day} at ${time}`;
  }, [publishDate, publishTime, isPublishToday]);
  // Slide cards stay at their 4-per-row max size up to 4 slides, shrink to
  // fit 5 or 6 per row, then hold at the 6-per-row size and wrap any more
  // onto additional rows. CSS flex-wrap can't do this on its own — it
  // decides line breaks using each item's un-shrunk basis size, so it would
  // wrap after 4 full-size cards regardless of shrink room. A grid with the
  // column count computed from the actual slide count sidesteps that.
  const slideGridColumns = Math.min(Math.max(slideCount, 4), 6);

  // Every platform with a known carousel cap, regardless of which accounts
  // are connected or selected to post to — always shown as a heads-up.
  const exceededPlatforms = Object.entries(CAROUSEL_MAX)
    .filter(([, max]) => slideCount > max)
    .map(([id, max]) => ({ id, max }))
    .sort((a, b) => a.max - b.max);

  // Platforms the selected accounts belong to, deduped — drives the
  // per-platform description inputs below.
  const selectedPlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const id of selectedAccountIds) {
      const a = accounts.find((acc) => acc.id === id);
      if (a) set.add(a.platform);
    }
    return set;
  }, [selectedAccountIds, accounts]);
  const previewPlatforms = useMemo(
    () => PHOTO_PREVIEW_PLATFORM_TABS.filter((pid) => selectedPlatforms.has(pid)),
    [selectedPlatforms]
  );
  // The first selected platform's slides ARE the shared arrays (slideSources
  // etc) — every other platform inherits them until it gets its own override.
  const primaryPlatform = previewPlatforms[0];
  const baseSlideData = (): PlatformSlideData => ({ sources: slideSources, uploads: slideUploads, layers: slideLayers });
  function uploadIdentity(image: RefImage | undefined) {
    if (!image) return "";
    return image.mediaId ? `media:${image.mediaId}` : `url:${image.url}`;
  }
  function slideDataDiffers(a: PlatformSlideData, b: PlatformSlideData) {
    const count = Math.max(slideCount, a.sources.length, b.sources.length, a.uploads.length, b.uploads.length, a.layers.length, b.layers.length);
    for (let i = 0; i < count; i++) {
      if ((a.sources[i] ?? "auto") !== (b.sources[i] ?? "auto")) return true;
      if (uploadIdentity(a.uploads[i]) !== uploadIdentity(b.uploads[i])) return true;
      if (JSON.stringify(a.layers[i] ?? []) !== JSON.stringify(b.layers[i] ?? [])) return true;
    }
    return false;
  }
  function setPlatformOverrideOrPrune(
    cur: Record<string, PlatformSlideData>,
    platformId: string,
    nextData: PlatformSlideData,
  ) {
    if (!slideDataDiffers(nextData, baseSlideData())) {
      const { [platformId]: _gone, ...rest } = cur;
      return rest;
    }
    return { ...cur, [platformId]: nextData };
  }
  function effectiveSlideData(platformId: string): PlatformSlideData {
    const override = platformId !== primaryPlatform ? platformSlideOverrides[platformId] : undefined;
    if (override && slideDataDiffers(override, baseSlideData())) {
      return override;
    }
    return baseSlideData();
  }
  // Which platform tab the Slides editor and the Review step are showing —
  // shared between both so switching steps doesn't lose your place. Falls
  // back to the base arrays/editing aspect when no platform is selected yet.
  const slidesActiveTab = previewPlatforms.includes(previewPlatform) ? previewPlatform : previewPlatforms[0];
  const activeSlideData = slidesActiveTab ? effectiveSlideData(slidesActiveTab) : baseSlideData();
  const slidesActiveFormat = slidesActiveTab ? selectedPhotoFormatForPlatform(slidesActiveTab, platformPhotoFormatIds) : null;
  const slidesActiveAspect = slidesActiveFormat?.aspect.id ?? aspect;

  // The layer the Advanced Text Settings panel styles, and a patch helper that
  // writes to whichever platform is active.
  const selectedLayerData = selectedLayer
    ? (activeSlideData.layers[selectedLayer.slide] ?? []).find((l) => l.id === selectedLayer.id) ?? null
    : null;
  function rememberTextDefaults(patch: Partial<TextLayer>) {
    const next = { ...textLayerDefaults.current };
    if (typeof patch.width === "number") next.width = clamp(patch.width, LAYER_WIDTH_MIN, LAYER_WIDTH_MAX);
    if (typeof patch.scale === "number") next.scale = clamp(patch.scale, TEXT_SCALE_MIN, TEXT_SCALE_MAX);
    if (typeof patch.font === "string") next.font = patch.font;
    if (typeof patch.style === "string") next.style = patch.style;
    if (typeof patch.color === "string") next.color = patch.color;
    if (typeof patch.bgEnabled === "boolean") next.bgEnabled = patch.bgEnabled;
    if (typeof patch.bgColor === "string") next.bgColor = patch.bgColor;
    if (typeof patch.bgOpacity === "number") next.bgOpacity = Math.round(clamp(patch.bgOpacity, 0, 100));
    textLayerDefaults.current = next;
  }
  function patchSelectedLayer(patch: Partial<TextLayer>) {
    rememberTextDefaults(patch);
    if (selectedLayer) updateLayer(selectedLayer.slide, selectedLayer.id, patch, slidesActiveTab);
  }
  function resetSelectedLayer() {
    textLayerDefaults.current = {
      width: DEFAULT_TEXT_LAYER_SETTINGS.width,
      scale: DEFAULT_TEXT_LAYER_SETTINGS.scale,
      font: DEFAULT_TEXT_LAYER_SETTINGS.font,
      style: DEFAULT_TEXT_LAYER_SETTINGS.style,
      color: DEFAULT_TEXT_LAYER_SETTINGS.color,
      bgEnabled: DEFAULT_TEXT_LAYER_SETTINGS.bgEnabled,
      bgColor: DEFAULT_TEXT_LAYER_SETTINGS.bgColor,
      bgOpacity: DEFAULT_TEXT_LAYER_SETTINGS.bgOpacity,
    };
    if (selectedLayer) {
      updateLayer(
        selectedLayer.slide,
        selectedLayer.id,
        {
          x: DEFAULT_TEXT_LAYER_SETTINGS.x,
          y: DEFAULT_TEXT_LAYER_SETTINGS.y,
          width: DEFAULT_TEXT_LAYER_SETTINGS.width,
          scale: DEFAULT_TEXT_LAYER_SETTINGS.scale,
          font: DEFAULT_TEXT_LAYER_SETTINGS.font,
          style: DEFAULT_TEXT_LAYER_SETTINGS.style,
          color: DEFAULT_TEXT_LAYER_SETTINGS.color,
          bgEnabled: DEFAULT_TEXT_LAYER_SETTINGS.bgEnabled,
          bgColor: DEFAULT_TEXT_LAYER_SETTINGS.bgColor,
          bgOpacity: DEFAULT_TEXT_LAYER_SETTINGS.bgOpacity,
        },
        slidesActiveTab,
      );
    }
  }

  // Rasterize the active platform's slide at that platform's native pixel size
  // and download it as a PNG — matches what the Review preview shows.
  async function downloadSlide(index: number) {
    if (downloadingSlide !== null) return;
    setDownloadingSlide(index);
    try {
      const blob = await renderSlideBlob({
        aspect: slidesActiveAspect,
        source: activeSlideData.sources[index] ?? "auto",
        uploadedImage: activeSlideData.uploads[index],
        show: showSlideText,
        layers: activeSlideData.layers[index] ?? [],
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const name = `${campaignName || "slideshow"}-${slidesActiveTab || "slide"}-${slidesActiveAspect.replace(":", "x")}-slide-${index + 1}`;
      a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // best-effort — a failed raster (e.g. a CORS-tainted remote upload) just
      // doesn't download; nothing else to clean up.
    } finally {
      setDownloadingSlide(null);
    }
  }

  const steps = mode === "templates" ? TEMPLATE_STEPS : CUSTOM_STEPS;
  // "Type" (the mode-chooser screen) is already done by the time this wizard
  // is showing, so it's displayed as a completed leading step rather than
  // being folded into `step`/`goBack`'s own indexing, which stays untouched.
  const displaySteps = ["Type", ...steps] as const;
  const displayStep = step + 1;
  const isSettingsStep = (mode === "custom" && step === 0) || (mode === "templates" && step === 1);
  const isImagesStep = mode === "templates" && step === 2;
  const isReviewStep = (mode === "custom" && step === 1) || (mode === "templates" && step === 3);
  const isTemplatesStep = mode === "templates" && step === 0;
  // Visual Style only makes sense when a real template supplied a look to
  // match — not for "Start from Scratch" or the Custom flow.
  const startedFromTemplate = mode === "templates" && !!selectedTemplate && selectedTemplate !== "scratch";

  function deleteUploadedMedia(mediaId?: string) {
    if (!mediaId) return;
    fetch(`/api/app/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" }).catch(() => {
      // Best-effort cleanup only. A missed delete should not interrupt editing.
    });
  }

  // Shows a local blob preview immediately, then uploads to R2 in the
  // background and swaps each entry's url to the durable /api/media-file/
  // URL on success — same pattern as pickSlideUpload below.
  function addFiles(files: FileList | null) {
    if (!files) return;
    setRefUploadError("");
    const room = REFERENCE_MAX - refImages.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (picked.length === 0) return;
    const entries = picked.map((f) => ({ id: crypto.randomUUID(), file: f, url: URL.createObjectURL(f), name: f.name }));
    setRefImages((cur) => {
      const next = [...cur, ...entries.map(({ id, url, name }) => ({ id, url, name }))];
      refImagesRef.current = next;
      return next;
    });
    setRefUploadingIds((cur) => new Set([...cur, ...entries.map((e) => e.id)]));
    entries.forEach(async ({ id, file, url }) => {
      try {
        const uploaded = await uploadOneFile(file);
        URL.revokeObjectURL(url);
        if (!refImagesRef.current.some((r) => r.id === id)) {
          deleteUploadedMedia(uploaded.id);
          return;
        }
        setRefImages((cur) => {
          const next = cur.map((r) => (r.id === id ? { ...r, url: `/api/media-file/${uploaded.id}`, mediaId: uploaded.id } : r));
          refImagesRef.current = next;
          return next;
        });
      } catch (e) {
        setRefUploadError(e instanceof Error ? e.message : "Couldn't upload an image — it'll only last this session.");
      } finally {
        setRefUploadingIds((cur) => {
          const next = new Set(cur);
          next.delete(id);
          return next;
        });
      }
    });
  }

  function removeRef(id: string) {
    setRefImages((cur) => {
      const gone = cur.find((r) => r.id === id);
      if (gone?.url.startsWith("blob:")) URL.revokeObjectURL(gone.url);
      deleteUploadedMedia(gone?.mediaId);
      const next = cur.filter((r) => r.id !== id);
      refImagesRef.current = next;
      return next;
    });
  }

  // Clamps to [SLIDE_MIN, SLIDE_MAX] and resizes the per-slide arrays (base
  // and any per-platform overrides) to match — shared by the +/- buttons and
  // direct number entry. Slide count itself isn't overridable per platform.
  function setSlides(target: number) {
    if (!Number.isFinite(target)) return;
    const next = Math.min(SLIDE_MAX, Math.max(SLIDE_MIN, Math.round(target)));
    const resize = <T,>(s: T[], fill: () => T) =>
      s.length >= next ? s.slice(0, next) : [...s, ...Array.from({ length: next - s.length }, fill)];
    setSlideCount(next);
    setSlideSources((s) => resize(s, () => "auto"));
    setSlideUploads((s) => resize<RefImage | undefined>(s, () => undefined));
    setSlideLayers((s) => resize<TextLayer[]>(s, () => []));
    setPlatformSlideOverrides((cur) => {
      const entries = Object.entries(cur);
      if (entries.length === 0) return cur;
      return Object.fromEntries(
        entries.map(([pid, d]) => [
          pid,
          {
            sources: resize(d.sources, () => "auto"),
            uploads: resize<RefImage | undefined>(d.uploads, () => undefined),
            layers: resize<TextLayer[]>(d.layers, () => []),
          },
        ]),
      );
    });
  }
  function growSlides() {
    setSlides(slideCount + 1);
  }
  function shrinkSlides() {
    setSlides(slideCount - 1);
  }

  // --- per-slide layer ops. All take the active platform: the primary (or no
  // platform) writes the shared base arrays; any other platform gets its own
  // independent override the first time it's touched. `mutate` maps one slide's
  // layer list to a new one.
  function mutateSlideLayers(index: number, platformId: string | undefined, mutate: (layers: TextLayer[]) => TextLayer[]) {
    if (!platformId || platformId === primaryPlatform) {
      setSlideLayers((s) => setAt(s, index, mutate(s[index] ?? []), []));
      return;
    }
    setPlatformSlideOverrides((cur) => {
      const base = cur[platformId] ?? effectiveSlideData(platformId);
      const nextData = { ...base, layers: setAt(base.layers, index, mutate(base.layers[index] ?? []), []) };
      return setPlatformOverrideOrPrune(cur, platformId, nextData);
    });
  }
  function addLayer(index: number, platformId?: string) {
    const layer = makeLayer("", textLayerDefaults.current);
    mutateSlideLayers(index, platformId, (ls) => [...ls, layer]);
    setSelectedLayer({ slide: index, id: layer.id });
    setOverlays("text");
  }
  function updateLayer(index: number, layerId: string, patch: Partial<TextLayer>, platformId?: string) {
    mutateSlideLayers(index, platformId, (ls) => ls.map((l) => (l.id === layerId ? { ...l, ...patch } : l)));
  }
  function deleteLayer(index: number, layerId: string, platformId?: string) {
    mutateSlideLayers(index, platformId, (ls) => ls.filter((l) => l.id !== layerId));
    setSelectedLayer((cur) => (cur?.id === layerId ? null : cur));
  }

  function writeSlideSource(index: number, id: string, platformId?: string) {
    const isBase = !platformId || platformId === primaryPlatform;
    if (isBase) {
      setSlideSources((s) => setAt(s, index, id, "auto"));
    } else {
      setPlatformSlideOverrides((cur) => {
        const base = cur[platformId] ?? effectiveSlideData(platformId);
        const nextData = { ...base, sources: setAt(base.sources, index, id, "auto") };
        return setPlatformOverrideOrPrune(cur, platformId, nextData);
      });
    }
  }

  function updateSlideSource(index: number, id: string, platformId?: string) {
    // Wait to apply the upload source until the person chooses its platform
    // scope. That makes Cancel a true cancellation instead of a partial edit.
    if (id === "upload") {
      setUploadTargetIndex(index);
      setUploadTargetPlatform(!platformId || platformId === primaryPlatform ? null : platformId);
      slideUploadInput.current?.click();
      return;
    }
    writeSlideSource(index, id, platformId);
  }

  // Writes a slide's uploaded photo to the base array or the given platform's
  // override, revoking whatever local blob preview it replaces. Shared by the
  // immediate local-preview write and the later durable-URL write below.
  function writeSlideUpload(index: number, platformId: string | null, image: RefImage, isBase: boolean) {
    const releasePrev = (prev: RefImage | undefined) => {
      if (prev && prev.url !== image.url && prev.url.startsWith("blob:")) URL.revokeObjectURL(prev.url);
      if (prev?.mediaId && prev.mediaId !== image.mediaId) deleteUploadedMedia(prev.mediaId);
    };
    if (isBase) {
      setSlideUploads((cur) => {
        releasePrev(cur[index]);
        return setAt(cur, index, image, undefined);
      });
      return;
    }
    setPlatformSlideOverrides((cur) => {
      const base = cur[platformId!] ?? effectiveSlideData(platformId!);
      releasePrev(base.uploads[index]);
      const nextData = { ...base, uploads: setAt(base.uploads, index, image, undefined) };
      return setPlatformOverrideOrPrune(cur, platformId!, nextData);
    });
  }

  // Shows a local blob preview immediately (instant feedback), then uploads
  // to R2 in the background and swaps in the durable /api/media-file/ URL —
  // that's what makes the photo survive a draft reload instead of vanishing
  // like a bare blob: URL does. A per-slide token guards against an older
  // upload finishing after a newer one and clobbering it.
  // Commit one upload across one or more platform-specific slide variants.
  // Each variant gets its own crop even though they share the original file.
  function applySlideUploadForPlatforms(index: number, platforms: (string | null)[], image: Omit<RefImage, "crop">, crops: Record<string, CropOffset>) {
    const includesBase = platforms.includes(null) || (primaryPlatform !== undefined && platforms.includes(primaryPlatform));
    if (includesBase) {
      const crop = crops[primaryPlatform ?? "base"] ?? DEFAULT_CROP;
      writeSlideSource(index, "upload");
      writeSlideUpload(index, null, { ...image, crop }, true);
    }
    setPlatformSlideOverrides((cur) => {
      let next = cur;
      for (const platformId of platforms) {
        if (!platformId || platformId === primaryPlatform) continue;
        const data = next[platformId] ?? effectiveSlideData(platformId);
        next = {
          ...next,
          [platformId]: {
            ...data,
            sources: setAt(data.sources, index, "upload", "auto"),
            uploads: setAt(data.uploads, index, { ...image, crop: crops[platformId] ?? DEFAULT_CROP }, undefined),
          },
        };
      }
      return next;
    });
  }

  function beginCropFlow(file: File, platforms: (string | null)[]) {
    const targetIndex = uploadTargetIndex;
    setUploadTargetIndex(null);
    setUploadTargetPlatform(null);
    if (targetIndex === null) return;
    setPendingCropFlow({ file, imageUrl: URL.createObjectURL(file), index: targetIndex, platforms, current: 0, crops: {} });
  }

  function cancelCropFlow() {
    if (pendingCropFlow?.imageUrl.startsWith("blob:")) URL.revokeObjectURL(pendingCropFlow.imageUrl);
    setPendingCropFlow(null);
  }

  async function commitCropFlow(flow: NonNullable<typeof pendingCropFlow>) {
    setPendingCropFlow(null);
    const key = `crop:${flow.index}:${flow.platforms.join(",")}`;
    const token = (uploadTokens.current[key] ?? 0) + 1;
    uploadTokens.current[key] = token;
    const localImage = { id: crypto.randomUUID(), url: flow.imageUrl, name: flow.file.name };
    applySlideUploadForPlatforms(flow.index, flow.platforms, localImage, flow.crops);

    setSlideUploadError("");
    setSlideUploadBusy({ index: flow.index, platform: flow.platforms.length === 1 ? flow.platforms[0] : null });
    try {
      const uploaded = await uploadOneFile(flow.file);
      if (uploadTokens.current[key] !== token) {
        deleteUploadedMedia(uploaded.id);
        return;
      }
      applySlideUploadForPlatforms(
        flow.index,
        flow.platforms,
        { id: localImage.id, url: `/api/media-file/${uploaded.id}`, name: flow.file.name, mediaId: uploaded.id },
        flow.crops,
      );
      // Every slide variant now points at the durable media URL, so its shared
      // local preview can be released without leaving a browser memory leak.
      window.setTimeout(() => URL.revokeObjectURL(flow.imageUrl), 0);
    } catch (e) {
      if (uploadTokens.current[key] !== token) return;
      setSlideUploadError(e instanceof Error ? e.message : "Couldn't upload that photo — it'll only last this session.");
    } finally {
      if (uploadTokens.current[key] === token) setSlideUploadBusy(null);
    }
  }

  function saveCropAndContinue(crop: CropOffset) {
    const flow = pendingCropFlow;
    if (!flow) return;
    const platformId = flow.platforms[flow.current] ?? "base";
    const next = { ...flow, crops: { ...flow.crops, [platformId]: crop } };
    if (flow.current < flow.platforms.length - 1) {
      setPendingCropFlow({ ...next, current: flow.current + 1 });
      return;
    }
    void commitCropFlow(next);
  }

  // Copies one slide's whole layer list (for whichever platform is being
  // viewed) onto every platform — base + every existing override — so that
  // slide's text is in sync everywhere. Images and other slides are untouched.
  function applyTextOverlayToAllPlatforms(index: number, fromPlatformId: string) {
    const layers = effectiveSlideData(fromPlatformId).layers[index] ?? [];
    const clone = () => layers.map((l) => ({ ...l }));
    setSlideLayers((s) => setAt(s, index, clone(), []));
    setPlatformSlideOverrides((cur) => {
      const entries = Object.entries(cur);
      if (entries.length === 0) return cur;
      return Object.fromEntries(
        entries.map(([pid, d]) => [pid, { ...d, layers: setAt(d.layers, index, clone(), []) }]),
      );
    });
  }

  // Selecting a template pre-fills the settings step, then advances.
  function applyTemplate(id: string) {
    const template = QUICK_TEMPLATES.find((t) => t.id === id);
    if (template) {
      setSlideCategory(template.category);
      setSlideCount(template.slides);
      setSlideSources(Array(template.slides).fill("auto"));
      setSlideUploads(Array(template.slides).fill(undefined));
      setSlideLayers(Array.from({ length: template.slides }, () => []));
      if (!campaignName.trim()) setCampaignName(template.title);
      if (!context.trim()) setContext(`${template.title}\n\n${template.desc}`);
    }
  }

  function goBack() {
    if (step === 0) {
      setMode("choose");
      setStep(0);
      setSelectedTemplate(null);
      return;
    }
    setStep((s) => s - 1);
  }

  function goNext() {
    if (isTemplatesStep) {
      if (!selectedTemplate) return;
      if (selectedTemplate !== "scratch") applyTemplate(selectedTemplate);
    }
    if (isSettingsStep && !canContinue) return;
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  function enterMode(next: StudioMode) {
    setMode(next);
    setStep(0);
    setSelectedTemplate(null);
    setDraftOrigin(next === "templates" ? "templates" : "custom");
    setDraftPlatform(null);
  }

  // Pulls the real post (caption + cover image) server-side and evaluates it
  // into an editable context brief. From the "choose" screen this starts a
  // whole new Custom draft; reopened mid-draft via the Reference pill's
  // "Change" button, it only swaps the reference images — everything else
  // the user has already built (slides, context, mode/step) is left alone.
  async function applyCopiedSlideshow() {
    const link = slideshowReference.trim();
    if (!link || copyBusy) return;
    if (!copyAcknowledged) {
      setCopyError("Please accept the content policy to continue.");
      return;
    }
    const isFreshStart = mode === "choose";
    setCopyBusy(true);
    setCopyError("");
    try {
      const response = await fetch("/api/app/studio/copy-slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, acknowledged: copyAcknowledged }),
      });
      const data = (await response.json()) as {
        platform?: string;
        images?: Array<string | { url: string; media_id?: string; mediaId?: string }>;
        context?: string;
        error?: { message?: string };
      };
      if (!response.ok || !data.context) {
        throw new Error(data.error?.message ?? "Couldn't copy that post.");
      }

      const pulled = (data.images ?? []).slice(0, REFERENCE_MAX);
      // Always a full replace (never appended/merged) so swapping to a post
      // with fewer images can't leave stragglers from the previous set —
      // including clearing out entirely if the new post has no images at all.
      // These are reference-only: inspiration for new AI-generated slides,
      // never the literal images we post — hence "ai", not "upload".
      setRefImages((cur) => {
        cur.forEach((r) => deleteUploadedMedia(r.mediaId));
        const next: RefImage[] = pulled.flatMap((image, i) => {
            const url = typeof image === "string" ? image : image.url;
            if (!url) return [];
            return [{
              id: crypto.randomUUID(),
              url,
              name: `Reference ${i + 1}`,
              mediaId: typeof image === "string" ? undefined : image.media_id ?? image.mediaId,
            }];
          });
        refImagesRef.current = next;
        return next;
      });

      if (isFreshStart) {
        setContext(data.context);
        setAspect(data.platform === "Instagram" ? "4:5" : "9:16");
        setOverlays("text");
        if (pulled.length) {
          const next = Math.min(SLIDE_MAX, Math.max(pulled.length, 3));
          setSlideCount(next);
          setSlideSources(Array(next).fill("ai"));
          setSlideUploads(Array(next).fill(undefined));
          setSlideLayers(Array.from({ length: next }, () => []));
        }
        setDraftOrigin("copy");
        setDraftPlatform(data.platform ?? null);
        setMode("custom");
        setStep(0);
      }

      setCopyModalOpen(false);
      setCopyAcknowledged(false);
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : "Couldn't copy that post.");
    } finally {
      setCopyBusy(false);
    }
  }

  // Best-effort autosave — saves what's already the source of truth for the
  // wizard, so a failure here just means the user re-enters it next time.
  // Context alone (e.g. right after a TikTok/Instagram copy) is enough to
  // save — don't make the user type a campaign name first.
  async function persistDraft() {
    if (mode === "choose" || (!campaignName.trim() && !context.trim())) return;
    setDraftStatus("saving");
    const remoteRefImages = refImages.filter((r) => !r.url.startsWith("blob:"));
    const remoteSlideUploads = slideUploads.map((r) => (r && !r.url.startsWith("blob:") ? r : undefined));
    const remotePlatformSlideOverrides = Object.fromEntries(
      Object.entries(platformSlideOverrides).map(([pid, d]) => [
        pid,
        { ...d, uploads: d.uploads.map((r) => (r && !r.url.startsWith("blob:") ? r : undefined)) },
      ]),
    );
    const snapshot = {
      mode,
      selectedTemplate,
      campaignName,
      publishDate,
      publishTime,
      context,
      slideCount,
      slideSources,
      slideUploads: remoteSlideUploads,
      slideLayers,
      platformSlideOverrides: remotePlatformSlideOverrides,
      platformPhotoFormatIds,
      refImages: remoteRefImages,
      platformCaptions,
      aiModel,
      aspect,
      overlays,
      language,
      slideCategory,
      translationMode,
      slideshowReference,
      selectedAccountIds: [...selectedAccountIds],
    };
    try {
      const response = await fetch("/api/app/studio/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftIdRef.current,
          template: "slideshow",
          mode: draftOrigin,
          source_platform: draftPlatform,
          title: campaignName,
          cover_image_url: remoteRefImages[0]?.url ?? remoteSlideUploads.find(Boolean)?.url ?? null,
          state: snapshot,
        }),
      });
      if (!response.ok) {
        setDraftStatus("idle");
        return;
      }
      const saved = (await response.json()) as StudioDraftRow;
      draftIdRef.current = saved.id;
      setDrafts((cur) => [saved, ...cur.filter((d) => d.id !== saved.id)]);
      setDraftStatus("saved");
    } catch {
      // Drafts are a convenience — a failed autosave shouldn't interrupt editing.
      setDraftStatus("idle");
    }
  }

  // Rehydrate a saved draft's wizard state and jump straight back into the editor.
  function resumeDraft(draft: StudioDraftRow) {
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(draft.state);
    } catch {
      return;
    }
    if (!parsed) return;
    const p = parsed as Record<string, never>;
    draftIdRef.current = draft.id;
    setDraftOrigin(draft.mode);
    setDraftPlatform(draft.source_platform);
    setSelectedTemplate(p.selectedTemplate ?? null);
    setCampaignName(p.campaignName ?? "");
    setPublishDate(p.publishDate ?? publishDate);
    setPublishTime(p.publishTime ?? publishTime);
    setContext(p.context ?? "");
    setSlideCount(p.slideCount ?? 5);
    setSlideSources(p.slideSources ?? []);
    setSlideUploads(p.slideUploads ?? []);
    setSlideLayers(p.slideLayers ?? []);
    setPlatformSlideOverrides(p.platformSlideOverrides ?? {});
    setPlatformPhotoFormatIds(p.platformPhotoFormatIds ?? {});
    setRefImages(p.refImages ?? []);
    setPlatformCaptions(p.platformCaptions ?? {});
    setAiModel(p.aiModel ?? "nano-banana-2");
    setAspect(p.aspect ?? "9:16");
    setOverlays(p.overlays ?? "none");
    setLanguage(p.language ?? "en");
    setSlideCategory(p.slideCategory ?? "educational");
    setTranslationMode(p.translationMode ?? "same");
    setSlideshowReference(p.slideshowReference ?? "");
    setSelectedAccountIds(new Set(p.selectedAccountIds ?? []));
    setDraftStatus("saved");
    setMode(draft.mode === "templates" ? "templates" : "custom");
    setStep(0);
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
      // best-effort
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void persistDraft();
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    draftOrigin,
    draftPlatform,
    selectedTemplate,
    campaignName,
    publishDate,
    publishTime,
    context,
    slideCount,
    slideSources,
    slideUploads,
    slideLayers,
    platformSlideOverrides,
    platformPhotoFormatIds,
    refImages,
    platformCaptions,
    aiModel,
    aspect,
    overlays,
    language,
    slideCategory,
    translationMode,
    slideshowReference,
    selectedAccountIds,
  ]);

  async function rewriteContext() {
    const trimmed = context.trim();
    if (!trimmed || contextBusy) return;
    setContextBusy(true);
    setContextError("");
    try {
      const response = await fetch("/api/app/studio/context-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: trimmed,
          campaignName,
          category: selectedCategory.name,
          language: selectedLanguage.name,
          slideCount,
        }),
      });
      const data = (await response.json()) as { text?: string; error?: { message?: string } };
      if (!response.ok || !data.text) {
        throw new Error(data.error?.message ?? "Couldn't rewrite the context.");
      }
      setContext(data.text.slice(0, CONTEXT_MAX));
    } catch (e) {
      setContextError(e instanceof Error ? e.message : "Couldn't rewrite the context.");
    } finally {
      setContextBusy(false);
    }
  }

  async function generatePlatformCaption(platformId: string) {
    if (captionBusy[platformId] || !context.trim()) return;
    setCaptionBusy((c) => ({ ...c, [platformId]: true }));
    setCaptionError((c) => ({ ...c, [platformId]: "" }));
    try {
      const response = await fetch("/api/app/studio/platform-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId, context, campaignName, length: captionLength }),
      });
      const data = (await response.json()) as { text?: string; error?: { message?: string } };
      if (!response.ok || !data.text) {
        throw new Error(data.error?.message ?? "Couldn't generate a caption.");
      }
      setPlatformCaptions((c) => ({ ...c, [platformId]: data.text as string }));
    } catch (e) {
      setCaptionError((c) => ({
        ...c,
        [platformId]: e instanceof Error ? e.message : "Couldn't generate a caption.",
      }));
    } finally {
      setCaptionBusy((c) => ({ ...c, [platformId]: false }));
    }
  }

  function checkCaptionTone(platformId: string) {
    const text = platformCaptions[platformId] ?? "";
    if (!text.trim()) return;
    setToneResults((r) => ({ ...r, [platformId]: checkAiTone(text) }));
  }

  async function improveCaption(platformId: string) {
    const text = platformCaptions[platformId] ?? "";
    if (improveBusy[platformId] || !text.trim()) return;
    setImproveBusy((c) => ({ ...c, [platformId]: true }));
    setImproveError((c) => ({ ...c, [platformId]: "" }));
    try {
      const response = await fetch("/api/app/studio/improve-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platformId,
          text,
          flagged: toneResults[platformId]?.matches ?? [],
        }),
      });
      const data = (await response.json()) as { text?: string; error?: { message?: string } };
      if (!response.ok || !data.text) {
        throw new Error(data.error?.message ?? "Couldn't improve this caption.");
      }
      setPlatformCaptions((c) => ({ ...c, [platformId]: data.text as string }));
      setToneResults((r) => ({ ...r, [platformId]: checkAiTone(data.text as string) }));
    } catch (e) {
      setImproveError((c) => ({
        ...c,
        [platformId]: e instanceof Error ? e.message : "Couldn't improve this caption.",
      }));
    } finally {
      setImproveBusy((c) => ({ ...c, [platformId]: false }));
    }
  }

  // Show this the instant there's something worth saving, not just once the
  // debounced save has actually round-tripped — otherwise there's a dead
  // window (up to the debounce delay, or right after page load) where a
  // draft that's clearly about to be saved shows no feedback at all.
  const hasDraftableContent = mode !== "choose" && (campaignName.trim().length > 0 || context.trim().length > 0);
  const draftStatusPill = !hasDraftableContent ? null : (
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
          <Link
            href="/dashboard/content-studio"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep"
          >
            <Icon name="chevronLeft" size={15} /> Content Studio
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => enterMode("choose")}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep"
          >
            <Icon name="chevronLeft" size={15} /> Back to Slide Types
          </button>
        )}
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-contrast">
            <Icon name="stack" size={18} />
          </span>
          Slide Show Studio
        </h1>
      </div>
      {mode !== "choose" && draftStatusPill}
    </div>
  );

  if (mode === "choose") {
    return (
      <div className="fade-up mx-auto w-full max-w-5xl pb-10">
        {header}
        <ModeChooser
          onTemplates={() => enterMode("templates")}
          onCustom={() => enterMode("custom")}
          onCopy={() => setCopyModalOpen(true)}
        />
        <DraftsSection drafts={drafts} loading={draftsLoading} onResume={resumeDraft} onDelete={deleteDraft} />
        <CopySlideshowModal
          open={copyModalOpen}
          link={slideshowReference}
          onLinkChange={setSlideshowReference}
          onClose={() => {
            setCopyModalOpen(false);
            setCopyError("");
          }}
          onFetch={applyCopiedSlideshow}
          busy={copyBusy}
          error={copyError}
          acknowledged={copyAcknowledged}
          onAcknowledgedChange={setCopyAcknowledged}
        />
      </div>
    );
  }

  const stepBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Step {displayStep + 1} of {displaySteps.length}
        </p>
        <h2 className="text-lg font-bold text-ink">{steps[step]}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isSettingsStep && draftStatus !== "idle" && (
          <button
            type="button"
            onClick={() => setConfirmDeleteDraft(true)}
            className="btn-subtle !py-1.5 text-sm text-red-600 hover:text-red-700"
          >
            <Icon name="trash" size={15} /> <span className="hidden sm:inline">Delete draft</span>
            <span className="sm:hidden">Delete</span>
          </button>
        )}
        <button type="button" onClick={goBack} className="btn-subtle !py-1.5 text-sm">
          <Icon name="chevronLeft" size={15} /> Back
        </button>
        {isReviewStep ? (
          <button type="button" className="btn-primary !py-1.5 text-sm">
            Launch <Icon name="sparkles" size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={(isSettingsStep && !canContinue) || (isTemplatesStep && !selectedTemplate)}
            className="btn-primary !py-1.5 text-sm disabled:opacity-50"
            title={
              isSettingsStep && !canContinue
                ? "Add a campaign name and context to continue"
                : isTemplatesStep && !selectedTemplate
                  ? "Pick a template to continue"
                  : undefined
            }
          >
            Next <Icon name="chevronRight" size={15} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fade-up mx-auto w-full max-w-7xl pb-10">
      {header}

      <div className="card mt-5 px-6 py-5">
        <Stepper steps={displaySteps} current={displayStep} />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        {stepBar}

        <input
          ref={slideUploadInput}
          type="file"
          accept="image/*"
          className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      setUploadTargetIndex(null);
                      setUploadTargetPlatform(null);
                    } else if (uploadTargetIndex !== null && previewPlatforms.length > 1) {
                      setPendingUploadScope({ file, index: uploadTargetIndex, platform: uploadTargetPlatform });
                    } else {
                      beginCropFlow(file, [uploadTargetPlatform ?? primaryPlatform ?? null]);
                    }
                    e.target.value = "";
                  }}
        />

        {isTemplatesStep && (
          <TemplatesStep
            selected={selectedTemplate}
            onSelect={setSelectedTemplate}
            onCopy={() => setCopyModalOpen(true)}
          />
        )}

        {isSettingsStep && (
          <>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <FieldLabel>Campaign Name</FieldLabel>
                <input
                  className="input mt-2"
                  placeholder="My Campaign…"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel icon="calendar">Publishing</FieldLabel>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                  <input
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>
            </div>

            <section className="mt-6">
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
                      <AccountAvatar
                        username={a.username}
                        platformId={a.platform}
                        avatarUrl={a.avatar_url}
                        selected={selectedAccountIds.has(a.id)}
                      />
                      <span className="max-w-[64px] truncate text-xs font-semibold text-muted">{a.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {(startedFromTemplate || refImages.length > 0) && (
              <section className="mt-6">
                <div className="flex items-center justify-between">
                  <FieldLabel>Reference Images</FieldLabel>
                  <span className="text-xs font-semibold text-muted">
                    {refImages.length}/{REFERENCE_MAX}
                  </span>
                </div>
                {slideshowReference && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-page/50 px-3 py-2 text-sm font-semibold text-muted">
                    {referencePlatformIconId(slideshowReference) && (
                      <PlatformIcon id={referencePlatformIconId(slideshowReference)!} size={14} />
                    )}
                    <span className="flex-1">Reference: {platformFromSlideshowUrl(slideshowReference)} slideshow</span>
                    <a
                      href={slideshowReference}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary-deep transition-colors hover:bg-white"
                    >
                      <Icon name="external" size={12} /> Open source
                    </a>
                    <button
                      type="button"
                      onClick={() => setCopyModalOpen(true)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary-deep transition-colors hover:bg-white"
                    >
                      <Icon name="refresh" size={12} /> Change
                    </button>
                  </div>
                )}
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {refImages.map((r) => (
                    <div key={r.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                      <img src={r.url} alt={r.name} className="h-full w-full object-cover" />
                      {refUploadingIds.has(r.id) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-ink/50">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRef(r.id)}
                        aria-label={`Remove ${r.name}`}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity hover:bg-ink group-hover:opacity-100"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                  {refImages.length < REFERENCE_MAX && (
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-muted transition-colors hover:border-primary hover:text-primary-deep"
                    >
                      <Icon name="upload" size={16} />
                      <span className="text-[10px] font-semibold">Add</span>
                    </button>
                  )}
                </div>
                {refUploadError && <p className="mt-2 text-xs font-semibold text-red-600">{refUploadError}</p>}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </section>
            )}

            <section className="mt-6">
              <div className="flex items-center gap-2">
                <FieldLabel icon="cube">Context</FieldLabel>
                <span className="text-xs font-semibold text-muted">— drives the AI image generation for the slides below</span>
              </div>
              <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                <textarea
                  className="min-h-[130px] w-full resize-y border-0 bg-white px-4 py-4 text-ink outline-none placeholder:text-muted focus:ring-0"
                  maxLength={CONTEXT_MAX}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g., 5 productivity tips for students..."
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-muted">The more specific, the better the results.</p>
                  <button
                    type="button"
                    onClick={rewriteContext}
                    disabled={!context.trim() || contextBusy}
                    className="btn-subtle !py-1.5 text-sm disabled:opacity-50"
                  >
                    {contextBusy ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
                    ) : (
                      <Icon name="sparkles" size={15} />
                    )}
                    {contextBusy ? "Rewriting…" : "AI Rewrite"}
                  </button>
                </div>
              </div>
              {contextError && <p className="mt-2 text-sm font-semibold text-red-600">{contextError}</p>}
            </section>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <FieldLabel icon="filter">Slides</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover
                    width="min-w-[18rem]"
                    align="right"
                    trigger={(open) => (
                      <ToolbarButton open={open} icon={selectedCategory.icon}>
                        {selectedCategory.name}
                      </ToolbarButton>
                    )}
                  >
                    {(close) => (
                      <>
                        {SLIDE_CATEGORIES.map((c) => (
                          <MenuRow
                            key={c.id}
                            active={c.id === slideCategory}
                            onClick={() => {
                              setSlideCategory(c.id);
                              close();
                            }}
                          >
                            <Icon
                              name={c.icon}
                              size={16}
                              className={c.id === slideCategory ? "text-primary-deep" : "text-muted"}
                            />
                            <span className="font-semibold">{c.name}</span>
                            {c.id === slideCategory && <Icon name="check" size={15} className="ml-auto text-primary-deep" />}
                          </MenuRow>
                        ))}
                      </>
                    )}
                  </Popover>
                  <button
                    type="button"
                    onClick={shrinkSlides}
                    disabled={slideCount <= SLIDE_MIN}
                    aria-label="Fewer slides"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-page text-ink transition-colors hover:bg-primary-soft disabled:opacity-40"
                  >
                    <span className="h-0.5 w-4 rounded-full bg-current" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={SLIDE_MIN}
                    max={SLIDE_MAX}
                    value={slideCount}
                    onChange={(e) => setSlides(Number(e.target.value))}
                    aria-label="Number of slides"
                    className="h-10 w-14 rounded-xl border border-line bg-white text-center text-lg font-black text-ink outline-none [appearance:textfield] focus:border-primary focus:ring-2 focus:ring-primary/25 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={growSlides}
                    disabled={slideCount >= SLIDE_MAX}
                    aria-label="More slides"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary-deep transition-colors hover:bg-primary-soft/70 disabled:opacity-40"
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              </div>

              {/* Generation settings — model, overlays, language — apply to
                  every slide in this section, so they live right under its title. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Popover
                  width="min-w-[17rem]"
                  trigger={(open) => (
                    <ToolbarButton open={open} icon="sparkles">
                      {selectedModel.name}
                      <CreditBadge credits={selectedModel.credits} />
                    </ToolbarButton>
                  )}
                >
                  {(close) => (
                    <>
                      <p className="px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-muted">AI Image Model</p>
                      {AI_MODELS.map((m) => {
                        const configured = configuredProviders[MODEL_PROVIDER[m.id]] ?? true;
                        return (
                          <MenuRow key={m.id} active={m.id === aiModel} onClick={() => { setAiModel(m.id); close(); }}>
                            <span className="min-w-0 flex-1">
                              <span className="block font-bold">{m.name}</span>
                              <span className="block truncate text-xs text-muted">{m.desc}</span>
                            </span>
                            {!configured && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                                Key needed
                              </span>
                            )}
                            <CreditBadge credits={m.credits} active={m.id === aiModel} />
                          </MenuRow>
                        );
                      })}
                      <Link
                        href="/dashboard/ai-image-keys"
                        onClick={close}
                        className="mt-1 flex items-center gap-1.5 border-t border-line px-2.5 py-2 text-xs font-semibold text-primary-deep hover:underline"
                      >
                        Manage keys <Icon name="external" size={12} />
                      </Link>
                    </>
                  )}
                </Popover>

                <Popover
                  width="min-w-[20rem]"
                  trigger={(open) => (
                    <ToolbarButton open={open} icon="type" muted>
                      <span className="hidden sm:inline">{selectedOverlay.name}</span>
                      <span className="sm:hidden">Overlay</span>
                    </ToolbarButton>
                  )}
                >
                  {(close) => (
                    <>
                      {OVERLAYS.map((o) => (
                        <MenuRow key={o.id} active={o.id === overlays} onClick={() => { setOverlays(o.id); close(); }}>
                          <Icon name={o.icon} size={16} className={o.id === overlays ? "text-primary-deep" : "text-muted"} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold">{o.name}</span>
                            <span className="block text-xs text-muted">{o.desc}</span>
                          </span>
                          {o.id === overlays && <Icon name="check" size={15} className="text-primary-deep" />}
                        </MenuRow>
                      ))}
                    </>
                  )}
                </Popover>

                <Popover
                  width="min-w-[13rem]"
                  trigger={(open) => (
                    <ToolbarButton open={open} icon="megaphone" muted>
                      <span>{flagForLanguage(language)}</span>
                      <span className="hidden sm:inline">{selectedLanguage.name}</span>
                    </ToolbarButton>
                  )}
                >
                  {(close) => (
                    <>
                      {LANGUAGES.map((l) => (
                        <MenuRow key={l.id} active={l.id === language} onClick={() => { setLanguage(l.id); close(); }}>
                          <span className="text-base">{l.flag}</span>
                          <span className="font-semibold">{l.name}</span>
                          {l.id === language && <Icon name="check" size={15} className="ml-auto text-primary-deep" />}
                        </MenuRow>
                      ))}
                    </>
                  )}
                </Popover>
              </div>

              {/* One tab per platform being posted to — each shows its own native
                  aspect (in text) and, once edited independently, its own slides. */}
              {previewPlatforms.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {previewPlatforms.map((pid) => {
                    const isActive = pid === slidesActiveTab;
                    const formatOptions = photoFormatOptionsForPlatform(pid);
                    const activeFormat = selectedPhotoFormatForPlatform(pid, platformPhotoFormatIds);
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
                            width="min-w-[18rem]"
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
                                  Photo format
                                </p>
                                {formatOptions.map((option) => (
                                  <MenuRow
                                    key={option.id}
                                    active={option.id === activeFormat.id}
                                    onClick={() => {
                                      setPlatformPhotoFormatIds((cur) => ({ ...cur, [pid]: option.id }));
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
                <p className="mt-4 text-xs text-muted">
                  Select accounts under Post To to format slides for each platform.
                </p>
              )}

              <div
                className="mt-4 grid gap-4"
                style={{ gridTemplateColumns: `repeat(${slideGridColumns}, minmax(0, 1fr))` }}
              >
                {activeSlideData.sources.map((source, i) => (
                  <SlideStructureCard
                    key={i}
                    index={i}
                    source={source}
                    onSourceChange={(id) => updateSlideSource(i, id, slidesActiveTab)}
                    uploadedImage={activeSlideData.uploads[i]}
                    aspect={slidesActiveAspect}
                    show={showSlideText}
                    layers={activeSlideData.layers[i] ?? []}
                    selectedLayerId={selectedLayer?.slide === i ? selectedLayer.id : null}
                    onSelectLayer={(id) => setSelectedLayer(id ? { slide: i, id } : null)}
                    onChangeLayer={(id, patch) => updateLayer(i, id, patch, slidesActiveTab)}
                    onAddLayer={() => addLayer(i, slidesActiveTab)}
                    onDeleteLayer={(id) => deleteLayer(i, id, slidesActiveTab)}
                    onApplyToAll={
                      previewPlatforms.length > 1 && slidesActiveTab
                        ? () => applyTextOverlayToAllPlatforms(i, slidesActiveTab)
                        : undefined
                    }
                    uploading={
                      slideUploadBusy?.index === i && slideUploadBusy.platform === (slidesActiveTab ?? null)
                    }
                  />
                ))}
              </div>
              {slideUploadError && <p className="mt-2 text-xs font-semibold text-red-600">{slideUploadError}</p>}
              {showSlideText && (
                <p className="mt-2 text-xs text-muted">
                  Add text with +, double-click a text to edit it, drag to move, and drag the dot to resize. Click a text to
                  style it in Advanced Text Settings below.
                </p>
              )}
              {exceededPlatforms.length > 0 && (
                <p className="mt-3 rounded-lg bg-warning-bg px-2.5 py-2 text-xs font-medium text-warning-ink">
                  Heads up: at {slideCount} slides, this won't be able to post to{" "}
                  {exceededPlatforms.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && (i === exceededPlatforms.length - 1 ? " or " : ", ")}
                      {platformOf(p.id)?.name ?? p.id} (max {p.max})
                    </span>
                  ))}
                  .
                </p>
              )}
            </section>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setAdvancedTextOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm font-bold text-muted transition-colors hover:text-primary-deep"
                >
                  <Icon name="gear" size={16} />
                  Advanced Text Settings
                  <Icon name={advancedTextOpen ? "chevronUp" : "chevronDown"} size={15} />
                </button>
                {advancedTextOpen && selectedLayerData && (
                  <button
                    type="button"
                    onClick={resetSelectedLayer}
                    className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:border-primary/50 hover:text-primary-deep"
                  >
                    Reset all
                  </button>
                )}
              </div>

              {advancedTextOpen &&
                (!selectedLayerData ? (
                  <div className="mt-4 rounded-xl border border-dashed border-line bg-page/50 p-6 text-center text-sm font-semibold text-muted">
                    Click a text on a slide to style it — font, size, style, and background apply to that text box.
                  </div>
                ) : (
                  <div
                    data-keep-selection
                    className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-5 rounded-xl border border-line bg-page/50 p-4"
                  >
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Font</p>
                      <div className="flex flex-wrap gap-1">
                        {FONTS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => patchSelectedLayer({ font: f.id })}
                            style={{ fontFamily: f.stack }}
                            className={`rounded-lg px-2.5 py-1.5 text-sm font-bold transition-colors ${
                              selectedLayerData.font === f.id
                                ? "border border-primary bg-white text-primary-deep"
                                : "border border-transparent text-muted hover:text-ink"
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
                            onClick={() => patchSelectedLayer({ scale: size.scale })}
                            className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                              selectedLayerData.scale === size.scale
                                ? "border border-primary bg-white text-primary-deep"
                                : "border border-transparent text-muted hover:text-ink"
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
                        value={selectedLayerData.scale}
                        onChange={(e) => patchSelectedLayer({ scale: Number(e.target.value) })}
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
                            value={selectedLayerData.scale}
                            onChange={(e) =>
                              patchSelectedLayer({
                                scale: clamp(Number(e.target.value), TEXT_SCALE_MIN, TEXT_SCALE_MAX),
                              })
                            }
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
                        {TEXT_STYLES.map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => patchSelectedLayer({ style: style.id })}
                            aria-pressed={selectedLayerData.style === style.id}
                            className={`flex h-12 items-center justify-center rounded-lg border p-1.5 transition-colors ${
                              selectedLayerData.style === style.id
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-line hover:border-primary/50"
                            }`}
                            title={style.name}
                          >
                            <span className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-slate-300 via-slate-400 to-slate-600">
                              <span
                                className={`rounded px-1.5 py-0.5 text-sm font-black ${style.className}`}
                                style={{
                                  color: selectedLayerData.color || style.fill,
                                  ...(selectedLayerData.bgEnabled ? { backgroundColor: hexToRgba(selectedLayerData.bgColor, selectedLayerData.bgOpacity ?? 100) } : {}),
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
                          value={selectedLayerData.color || DEFAULT_TEXT_LAYER_SETTINGS.color}
                          onChange={(e) => patchSelectedLayer({ color: e.target.value })}
                          className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                          aria-label="Font color"
                        />
                        <input
                          type="text"
                          value={selectedLayerData.color || DEFAULT_TEXT_LAYER_SETTINGS.color}
                          onChange={(e) => patchSelectedLayer({ color: e.target.value })}
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
                          onClick={() => patchSelectedLayer({ bgEnabled: false })}
                          className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                            !selectedLayerData.bgEnabled
                              ? "border border-primary bg-white text-primary-deep"
                              : "border border-transparent text-muted hover:text-ink"
                          }`}
                        >
                          None
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchSelectedLayer({
                              bgEnabled: true,
                              bgColor: selectedLayerData.bgColor || textLayerDefaults.current.bgColor,
                              bgOpacity: selectedLayerData.bgOpacity ?? textLayerDefaults.current.bgOpacity,
                            })
                          }
                          className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                            selectedLayerData.bgEnabled
                              ? "border border-primary bg-white text-primary-deep"
                              : "border border-transparent text-muted hover:text-ink"
                          }`}
                        >
                          Color
                        </button>
                        {selectedLayerData.bgEnabled && (
                          <label className="flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1">
                            <input
                              type="color"
                              value={selectedLayerData.bgColor}
                              onChange={(e) => patchSelectedLayer({ bgColor: e.target.value })}
                              className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                              aria-label="Text background color"
                            />
                            <input
                              type="text"
                              value={selectedLayerData.bgColor}
                              onChange={(e) => patchSelectedLayer({ bgColor: e.target.value })}
                              className="w-20 min-w-0 bg-transparent font-mono text-xs font-bold text-ink outline-none"
                              aria-label="Text background color hex code"
                              spellCheck={false}
                            />
                          </label>
                        )}
                      </div>
                      {selectedLayerData.bgEnabled && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="shrink-0 text-xs font-semibold text-muted">Opacity</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={selectedLayerData.bgOpacity ?? 100}
                            onChange={(e) => patchSelectedLayer({ bgOpacity: Number(e.target.value) })}
                            aria-label="Background opacity"
                            className="min-w-24 flex-1 cursor-pointer accent-primary"
                          />
                          <span className="flex shrink-0 items-center rounded-lg border border-line bg-white px-2 py-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={selectedLayerData.bgOpacity ?? TEXT_BG_OPACITY_DEFAULT}
                              onChange={(e) =>
                                patchSelectedLayer({
                                  bgOpacity: Math.round(clamp(Number(e.target.value), 0, 100)),
                                })
                              }
                              className="w-10 bg-transparent text-right font-mono text-xs font-bold text-ink outline-none"
                              aria-label="Background opacity value"
                            />
                            <span className="ml-1 font-mono text-xs text-muted/70">%</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </section>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel icon="type">Platform Captions (optional)</FieldLabel>
                {selectedPlatforms.size > 0 && (
                  <div className="flex items-center gap-1 rounded-xl border border-line bg-page p-1">
                    {(
                      [
                        ["short", "Short"],
                        ["medium", "Medium"],
                        ["long", "Long"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCaptionLength(id)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                          captionLength === id ? "bg-white text-primary-deep shadow-sm" : "text-muted hover:text-ink"
                        }`}
                        title={`AI Auto-fill writes a ${label.toLowerCase()} caption`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedPlatforms.size === 0 ? (
                <p className="mt-2 text-sm text-muted">Select accounts under Post To to optionally write a caption for each platform.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-3">
                  <p className="text-sm text-muted">Leave any platform blank to launch without a caption.</p>
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
                              // Edited by hand — the last check no longer reflects this text.
                              setToneResults((r) => {
                                if (!(id in r)) return r;
                                const next = { ...r };
                                delete next[id];
                                return next;
                              });
                            }}
                            placeholder={`Description for ${platformOf(id)?.name ?? id}…`}
                          />
                          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-2">
                            <button
                              type="button"
                              onClick={() => generatePlatformCaption(id)}
                              disabled={captionBusy[id] || !context.trim()}
                              title={!context.trim() ? "Add context above first" : undefined}
                              className="btn-subtle !py-1 text-xs disabled:opacity-50"
                            >
                              {captionBusy[id] ? (
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
                              ) : (
                                <Icon name="sparkles" size={12} />
                              )}
                              {captionBusy[id] ? "Writing…" : "AI Auto-fill"}
                            </button>
                            <button
                              type="button"
                              onClick={() => checkCaptionTone(id)}
                              disabled={!value.trim()}
                              className="btn-subtle !py-1 text-xs disabled:opacity-50"
                            >
                              <Icon name="search" size={12} />
                              Check Tone
                            </button>
                            {tone && tone.level !== "natural" && (
                              <button
                                type="button"
                                onClick={() => improveCaption(id)}
                                disabled={improveBusy[id]}
                                className="btn-subtle !py-1 text-xs disabled:opacity-50"
                              >
                                {improveBusy[id] ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
                                ) : (
                                  <Icon name="sparkles" size={12} />
                                )}
                                {improveBusy[id] ? "Improving…" : "Make it sound less AI"}
                              </button>
                            )}
                          </div>
                          {tone && (
                            <div className="border-t border-line bg-page/50 px-3 py-2">
                              <p
                                className={`text-xs font-bold ${
                                  tone.level === "high"
                                    ? "text-red-600"
                                    : tone.level === "some"
                                      ? "text-amber-700"
                                      : "text-emerald-700"
                                }`}
                              >
                                {tone.level === "high"
                                  ? "Sounds very AI-generated"
                                  : tone.level === "some"
                                    ? "A little AI-ish"
                                    : "Sounds natural"}
                              </p>
                              {tone.matches.length > 0 && (
                                <p className="mt-0.5 text-xs text-muted">
                                  Flagged: &ldquo;{tone.matches.join("”, “")}&rdquo;
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        {captionError[id] && (
                          <p className="mt-1 text-xs font-semibold text-red-600">{captionError[id]}</p>
                        )}
                        {improveError[id] && (
                          <p className="mt-1 text-xs font-semibold text-red-600">{improveError[id]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {isImagesStep && (
          <div className="mt-5">
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-page/40 px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-deep">
                <Icon name="sparkles" size={26} />
              </span>
              <div>
                <p className="text-lg font-black text-ink">Images generate on launch</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  Each slide below uses the source you chose in Settings. Image generation isn’t connected
                  yet — this is a preview of the slide structure.
                </p>
              </div>
            </div>
            <div
              className="mt-5 grid gap-4"
              style={{ gridTemplateColumns: `repeat(${slideGridColumns}, minmax(0, 1fr))` }}
            >
              {slideSources.map((source, i) => (
                <SlideStructureCard
                  key={i}
                  index={i}
                  source={source}
                  onSourceChange={(id) => updateSlideSource(i, id)}
                  uploadedImage={slideUploads[i]}
                  aspect={aspect}
                  show={showSlideText}
                  layers={slideLayers[i] ?? []}
                  selectedLayerId={selectedLayer?.slide === i ? selectedLayer.id : null}
                  onSelectLayer={(id) => setSelectedLayer(id ? { slide: i, id } : null)}
                  onChangeLayer={(id, patch) => updateLayer(i, id, patch)}
                  onAddLayer={() => addLayer(i)}
                  onDeleteLayer={(id) => deleteLayer(i, id)}
                  uploading={slideUploadBusy?.index === i && slideUploadBusy.platform === null}
                />
              ))}
            </div>
            {slideUploadError && <p className="mt-2 text-xs font-semibold text-red-600">{slideUploadError}</p>}
          </div>
        )}

        {isReviewStep &&
          (() => {
            const activeTab = slidesActiveTab;
            const activeAccounts = activeTab
              ? accounts.filter((a) => selectedAccountIds.has(a.id) && a.platform === activeTab)
              : [];
            const activePlatformInfo = activeTab ? platformOf(activeTab) : undefined;
            const activeCaption = activeTab ? platformCaptions[activeTab] ?? "" : "";
            const activeMax = activeTab
              ? CAPTION_MAX_BY_PLATFORM[activeTab as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? CAPTION_MAX
              : CAPTION_MAX;
            const activeAspectInfo = ASPECTS.find((a) => a.id === slidesActiveAspect) ?? selectedAspect;
            const reviewSlideData = activeSlideData;
            return (
              <>
                {/* Campaign + schedule header */}
                <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Campaign</p>
                    <h3 className="text-xl font-black text-ink">{campaignName || "Untitled campaign"}</h3>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-page/60 px-3 py-2">
                    <Icon name="calendar" size={16} className="text-primary-deep" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">Scheduled</p>
                      <p className="text-sm font-bold text-ink">{publishedLabel}</p>
                    </div>
                  </div>
                </div>

                {/* Quick facts */}
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold text-muted">
                  {[
                    `${previewPlatforms.length} platform${previewPlatforms.length === 1 ? "" : "s"}`,
                    `${slideCount} slides`,
                    selectedCategory.name,
                  ].map((fact) => (
                    <span key={fact} className="rounded-full border border-line bg-white px-3 py-1">
                      {fact}
                    </span>
                  ))}
                </div>

                {previewPlatforms.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-line bg-page/40 p-8 text-center">
                    <p className="text-sm font-semibold text-muted">
                      No accounts selected. Go back to Settings and choose where to post under{" "}
                      <span className="font-bold text-ink">Post To</span>.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5">
                    {/* Platform tabs */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {previewPlatforms.map((pid) => {
                        const isActive = pid === activeTab;
                        const activeFormat = selectedPhotoFormatForPlatform(pid, platformPhotoFormatIds);
                        return (
                          <button
                            key={pid}
                            type="button"
                            onClick={() => setPreviewPlatform(pid)}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                              isActive
                                ? "border-primary bg-primary-soft/50 text-primary-deep"
                                : "border-line bg-white text-muted hover:text-ink"
                            }`}
                          >
                            <PlatformIcon id={pid} size={16} />
                            {platformOf(pid)?.name ?? pid}
                            <span className={isActive ? "text-primary-deep/70" : "text-muted/70"}>
                              {activeFormat.aspect.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Post preview */}
                    <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                      {/* Account + time header */}
                      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {activeAccounts.length > 0 ? (
                            <>
                              <AccountAvatar
                                username={activeAccounts[0].username}
                                platformId={activeTab}
                                avatarUrl={activeAccounts[0].avatar_url}
                                size={38}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-ink">{activeAccounts[0].username}</p>
                                <p className="text-xs text-muted">
                                  {activeAccounts.length > 1 ? `+${activeAccounts.length - 1} more · ` : ""}
                                  {activePlatformInfo?.name}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <PlatformIcon id={activeTab} size={28} />
                              <p className="text-sm font-bold text-ink">{activePlatformInfo?.name}</p>
                            </>
                          )}
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">
                          <Icon name="clock" size={13} /> {publishedLabel}
                        </span>
                      </div>

                      {/* Slide carousel — reformatted to this platform's native aspect,
                          regardless of the editing aspect picked back in Settings. */}
                      <div className="flex items-center justify-between gap-2 px-4 pt-3">
                        <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                          <Icon name="image" size={13} />
                          Formatted for {activePlatformInfo?.name ?? "this platform"}
                        </span>
                        <span className="text-xs font-semibold text-muted">
                          {activeAspectInfo.name} · {activeAspectInfo.px}
                        </span>
                      </div>
                      <div className="flex snap-x gap-2.5 overflow-x-auto px-4 py-3">
                        {reviewSlideData.sources.map((source, i) => (
                          <div key={i} className="relative w-36 shrink-0 snap-start">
                            <SlidePreviewFrame
                              index={i}
                              source={source ?? "auto"}
                              uploadedImage={reviewSlideData.uploads[i]}
                              aspect={slidesActiveAspect}
                              show={showSlideText}
                              layers={reviewSlideData.layers[i] ?? []}
                            />
                            <button
                              type="button"
                              onClick={() => downloadSlide(i)}
                              disabled={downloadingSlide !== null}
                              title={`Download slide ${i + 1} (${activeAspectInfo.name}, ${activeAspectInfo.px})`}
                              aria-label={`Download slide ${i + 1}`}
                              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-ink/70 text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
                            >
                              {downloadingSlide === i ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
                              ) : (
                                <Icon name="download" size={14} />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Caption for this platform */}
                      <div className="border-t border-line px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-muted">
                            <Icon name="type" size={12} /> Caption
                          </p>
                          <span
                            className={`text-xs font-semibold ${
                              activeCaption.length > activeMax ? "text-red-600" : "text-muted"
                            }`}
                          >
                            {activeCaption.length}/{activeMax}
                          </span>
                        </div>
                        {activeCaption.trim() ? (
                          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{activeCaption}</p>
                        ) : (
                          <p className="mt-1.5 text-sm italic text-muted">
                            No caption yet — add one back in Platform Captions.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Collapsible post details */}
                <details className="group mt-4 rounded-xl border border-line bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-ink">
                    <span className="flex items-center gap-1.5">
                      <Icon name="type" size={14} /> Post details
                    </span>
                    <Icon name="chevronDown" size={16} className="text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                    {[
                      ["Category", selectedCategory.name],
                      ["Aspect", `${selectedAspect.name} · ${selectedAspect.hint}`],
                      ["Overlays", selectedOverlay.name],
                      ["Language", `${selectedLanguage.flag} ${selectedLanguage.name}`],
                      ["Translation", translationMode === "same" ? "Same as primary" : selectedTranslationLanguage.name],
                      ["AI model", selectedModel.name],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-line bg-page/60 p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{label}</p>
                        <p className="mt-0.5 text-sm font-bold text-ink">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-line px-4 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">Context</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{context}</p>
                  </div>
                </details>

                {draftStatus !== "idle" && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteDraft(true)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 transition-colors hover:text-red-700"
                    >
                      <Icon name="trash" size={14} />
                      Delete draft
                    </button>
                  </div>
                )}
              </>
            );
          })()}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <button type="button" onClick={goBack} className="btn-subtle !py-1.5 text-sm">
            <Icon name="chevronLeft" size={15} /> Back
          </button>
          {isReviewStep ? (
            <button type="button" className="btn-primary !py-1.5 text-sm">
              Launch <Icon name="sparkles" size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={(isSettingsStep && !canContinue) || (isTemplatesStep && !selectedTemplate)}
              className="btn-primary !py-1.5 text-sm disabled:opacity-50"
              title={
                isSettingsStep && !canContinue
                  ? "Add a campaign name and context to continue"
                  : isTemplatesStep && !selectedTemplate
                    ? "Pick a template to continue"
                    : undefined
              }
            >
              Next <Icon name="chevronRight" size={15} />
            </button>
          )}
        </div>
      </div>

      {draftStatusPill && <div className="mt-4 flex justify-center">{draftStatusPill}</div>}

      {pendingUploadScope && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/55 p-4" role="dialog" aria-modal="true" aria-label="Choose image scope">
          <div className="card w-full max-w-md p-5 shadow-[0_24px_60px_rgba(6,63,59,0.26)]">
            <p className="text-lg font-extrabold text-ink">Where should this image appear?</p>
            <p className="mt-1.5 text-sm text-muted">
              Choose the scope first. You’ll set the crop for each selected platform right after this.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                className="btn-subtle justify-start !px-4 !py-3 text-left"
                onClick={() => {
                  const { file, platform } = pendingUploadScope;
                  setPendingUploadScope(null);
                  beginCropFlow(file, [platform ?? primaryPlatform ?? null]);
                }}
              >
                <span>
                  <span className="block font-bold">This platform only</span>
                  <span className="mt-0.5 block text-xs font-medium text-muted">Apply to Slide {pendingUploadScope.index + 1} for {platformOf(pendingUploadScope.platform ?? primaryPlatform ?? "")?.name ?? "this platform"}.</span>
                </span>
              </button>
              <button
                type="button"
                className="btn-primary justify-start !px-4 !py-3 text-left"
                onClick={() => {
                  const { file } = pendingUploadScope;
                  setPendingUploadScope(null);
                  beginCropFlow(file, previewPlatforms.length ? previewPlatforms : [null]);
                }}
              >
                <span>
                  <span className="block font-bold">All selected platforms</span>
                  <span className="mt-0.5 block text-xs font-medium text-white/80">Crop Slide {pendingUploadScope.index + 1} once for each format.</span>
                </span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn-subtle"
                onClick={() => {
                  setPendingUploadScope(null);
                  setUploadTargetIndex(null);
                  setUploadTargetPlatform(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCropFlow && (() => {
        const platformId = pendingCropFlow.platforms[pendingCropFlow.current];
        const platformLabel = platformId ? platformOf(platformId)?.name ?? platformId : "your selected format";
        const activeAspect = platformId ? selectedPhotoFormatForPlatform(platformId, platformPhotoFormatIds).aspect.id : aspect;
        const isLast = pendingCropFlow.current === pendingCropFlow.platforms.length - 1;
        return (
          <ImageCropModal
            imageUrl={pendingCropFlow.imageUrl}
            imageName={pendingCropFlow.file.name}
            targetAspect={aspectRatioValue(activeAspect)}
            platformLabel={platformLabel}
            stepLabel={pendingCropFlow.platforms.length > 1 ? `Crop ${pendingCropFlow.current + 1} of ${pendingCropFlow.platforms.length}` : undefined}
            actionLabel={isLast ? "Use image" : "Next crop"}
            initial={pendingCropFlow.crops[platformId ?? "base"] ?? DEFAULT_CROP}
            onCancel={cancelCropFlow}
            onSave={saveCropAndContinue}
          />
        );
      })()}

      <ConfirmDialog
        open={confirmDeleteDraft}
        title="Delete this draft?"
        message="This slideshow draft will be permanently deleted and you'll be sent back to the type picker. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDeleteDraft(false);
          if (draftIdRef.current) void deleteDraft(draftIdRef.current);
          enterMode("choose");
        }}
        onCancel={() => setConfirmDeleteDraft(false)}
      />

      <CopySlideshowModal
        open={copyModalOpen}
        link={slideshowReference}
        onLinkChange={setSlideshowReference}
        onClose={() => {
          setCopyModalOpen(false);
          setCopyError("");
        }}
        onFetch={applyCopiedSlideshow}
        busy={copyBusy}
        error={copyError}
        acknowledged={copyAcknowledged}
        onAcknowledgedChange={setCopyAcknowledged}
      />
    </div>
  );
}
