"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "./icons";
import { PlatformIcon, AccountAvatar } from "./platform-icon";
import { platform as platformOf, CAROUSEL_MAX, CAPTION_MAX, CAPTION_MAX_BY_PLATFORM } from "@/lib/platforms";
import { checkAiTone, type AiToneResult } from "@/lib/ai-tone";
import type { StudioDraftMode, StudioDraftRow } from "@/lib/studio-drafts";

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

// AI image providers for the Visual Style / generation step. Placeholder list —
// no provider is wired yet (see AiModelPopover usage below).
const AI_MODELS = [
  { id: "gpt-image-2", name: "GPT Image 2", desc: "Sharp layouts, text, and references", credits: 2 },
  { id: "nano-banana-2", name: "Nano Banana 2", desc: "Fast, high quality, and reference-aware", credits: 1 },
  { id: "seedream-5", name: "SeeDream 5", desc: "Best balance of quality and speed", credits: 1 },
] as const;

const ASPECTS = [
  { id: "9:16", name: "9:16", hint: "Portrait (TikTok, Reels)", px: "1080×1920px" },
  { id: "2:3", name: "2:3", hint: "Portrait (Pinterest)", px: "1000×1500px" },
  { id: "3:4", name: "3:4", hint: "Portrait (Threads, LinkedIn)", px: "1080×1440px" },
  { id: "4:5", name: "4:5", hint: "Portrait (Instagram Feed)", px: "1080×1350px" },
  { id: "1:1", name: "1:1", hint: "Square (Instagram, X, Bluesky)", px: "1080×1080px" },
  { id: "16:9", name: "16:9", hint: "Landscape (X, Facebook, LinkedIn)", px: "1920×1080px" },
] as const;

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

// Text color/shadow only — whether the text sits on a background chip (and
// what color that chip is) is a separate control (see textBgEnabled/textBgColor),
// so any of these can be paired with any background.
const TEXT_STYLES = [
  { id: "shadow", name: "Shadow", className: "text-white [text-shadow:0_2px_0_rgba(0,0,0,0.85)]" },
  { id: "light", name: "Light text", className: "text-white" },
  { id: "dark", name: "Dark text", className: "text-ink" },
] as const;

const TEXT_SIZES = [
  { id: "normal", name: "Normal" },
  { id: "small", name: "Small" },
] as const;

const TEXT_WIDTHS = [
  { id: "wide", name: "Wide" },
  { id: "narrow", name: "Narrow" },
] as const;

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

type RefImage = { id: string; url: string; name: string };
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
          className={`absolute z-30 ${width} overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-[0_18px_40px_rgba(6,63,59,0.16)] ${
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
    case "3:4":
      return "aspect-[3/4]";
    case "4:5":
      return "aspect-[4/5]";
    case "16:9":
      return "aspect-[16/9]";
    case "9:16":
    default:
      return "aspect-[9/16]";
  }
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

type SlideTextConfig = {
  className: string; // color/shadow treatment from TEXT_STYLES
  bgEnabled: boolean;
  bgColor: string;
  size: (typeof TEXT_SIZES)[number]["id"];
  width: (typeof TEXT_WIDTHS)[number]["id"];
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function SlideStructureCard({
  index,
  source,
  onSourceChange,
  uploadedImage,
  aspect,
  showText,
  text,
  onTextChange,
  textPos,
  onTextPosChange,
  textConfig,
}: {
  index: number;
  source: string;
  onSourceChange: (id: string) => void;
  uploadedImage?: RefImage;
  aspect: (typeof ASPECTS)[number]["id"];
  showText: boolean;
  text: string;
  onTextChange: (t: string) => void;
  textPos: { x: number; y: number };
  onTextPosChange: (p: { x: number; y: number }) => void;
  textConfig: SlideTextConfig;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Drag the overlay anywhere in the image, clamped to a safe inset so the
  // block (centered on this point) can't run off the edge.
  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    const box = boxRef.current;
    if (!box) return;
    const move = (ev: PointerEvent) => {
      const rect = box.getBoundingClientRect();
      onTextPosChange({
        x: clamp(((ev.clientX - rect.left) / rect.width) * 100, 14, 86),
        y: clamp(((ev.clientY - rect.top) / rect.height) * 100, 8, 92),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const sizeClass = textConfig.size === "normal" ? "text-[13px]" : "text-[10px]";
  const widthClass = textConfig.width === "wide" ? "max-w-[92%]" : "max-w-[64%]";

  return (
    // Sizing comes entirely from the parent grid's column count (see
    // slideGridColumns) — this just fills its grid cell.
    <div className="flex flex-col gap-2">
      <div
        ref={boxRef}
        className={`group relative w-full overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary-soft/70 via-white to-page shadow-sm ${aspectClass(aspect)}`}
      >
        {/* Only a photo picked specifically for this slide is shown as-is —
            reference images (uploaded or pulled from a copied post) are just
            inspiration for a new AI-generated image, never the literal output. */}
        {source === "upload" && uploadedImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview.
          <img src={uploadedImage.url} alt={uploadedImage.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,139,128,0.2),transparent_35%),linear-gradient(145deg,rgba(16,139,128,0.12),rgba(255,255,255,0.72))]" />
            <span className="relative z-10 rotate-[-8deg] text-2xl font-black leading-[0.82] text-primary-deep/35">
              POST<br />TRAIN
            </span>
          </div>
        )}
        {showText && text.trim() && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Drag to reposition overlay text"
            onPointerDown={startDrag}
            style={{ left: `${textPos.x}%`, top: `${textPos.y}%`, transform: "translate(-50%, -50%)" }}
            className={`absolute z-20 cursor-grab touch-none select-none rounded ${widthClass} px-1 text-center active:cursor-grabbing`}
          >
            <span
              style={textConfig.bgEnabled ? { backgroundColor: textConfig.bgColor } : undefined}
              className={`inline-block whitespace-pre-wrap break-words rounded px-1 py-0.5 font-black leading-tight ${sizeClass} ${textConfig.className}`}
            >
              {text}
            </span>
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex items-end justify-between text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/80 text-sm font-black">
            {index + 1}
          </span>
        </div>
      </div>
      <SlideSourceControl value={source} onChange={onSourceChange} aspect={aspect} />
      {showText && (
        <div>
          <textarea
            value={text}
            maxLength={SLIDE_TEXT_MAX}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={`Slide ${index + 1} text…`}
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-0.5 flex justify-end">
            <span className={`text-[10px] font-semibold ${text.length >= SLIDE_TEXT_MAX ? "text-red-600" : "text-muted"}`}>
              {text.length}/{SLIDE_TEXT_MAX}
            </span>
          </div>
        </div>
      )}
    </div>
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
}: {
  initialSlideTexts?: string[];
  sourceExploreItemId?: string;
  accounts?: SlideshowAccount[];
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
  const [slideCount, setSlideCount] = useState(() => initialSlideTexts?.length || 5);
  const [slideSources, setSlideSources] = useState<string[]>(() =>
    Array(initialSlideTexts?.length || 5).fill("auto"),
  );
  // Per-slide photos picked via the "Uploaded Images" source — distinct from
  // refImages, which are style/context references and must never be posted as-is.
  const [slideUploads, setSlideUploads] = useState<(RefImage | undefined)[]>(() =>
    Array(initialSlideTexts?.length || 5).fill(undefined),
  );
  // Per-slide overlay text + its position (percent of the image, center of the
  // text block). Prefilled from Explore "recreate" when arriving with slides.
  const [slideTexts, setSlideTexts] = useState<string[]>(() =>
    initialSlideTexts?.map((t) => t.slice(0, SLIDE_TEXT_MAX)) ?? Array(5).fill(""),
  );
  const [slideTextPos, setSlideTextPos] = useState<{ x: number; y: number }[]>(() =>
    Array(initialSlideTexts?.length || 5).fill({ x: 50, y: 82 }),
  );
  const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);
  const slideUploadInput = useRef<HTMLInputElement>(null);
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>({});
  const [captionBusy, setCaptionBusy] = useState<Record<string, boolean>>({});
  const [captionError, setCaptionError] = useState<Record<string, string>>({});
  const [toneResults, setToneResults] = useState<Record<string, AiToneResult>>({});
  const [improveBusy, setImproveBusy] = useState<Record<string, boolean>>({});
  const [improveError, setImproveError] = useState<Record<string, string>>({});
  const [aiModel, setAiModel] = useState<(typeof AI_MODELS)[number]["id"]>("nano-banana-2");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]["id"]>("9:16");
  const [overlays, setOverlays] = useState<(typeof OVERLAYS)[number]["id"]>("none");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]["id"]>("en");
  const [slideCategory, setSlideCategory] = useState<SlideCategoryId>("educational");
  const [advancedTextOpen, setAdvancedTextOpen] = useState(true);
  const [textStyle, setTextStyle] = useState<(typeof TEXT_STYLES)[number]["id"]>("shadow");
  const [textBgEnabled, setTextBgEnabled] = useState(false);
  const [textBgColor, setTextBgColor] = useState("#000000");
  const [textSize, setTextSize] = useState<(typeof TEXT_SIZES)[number]["id"]>("small");
  const [textWidth, setTextWidth] = useState<(typeof TEXT_WIDTHS)[number]["id"]>("narrow");
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/studio/drafts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: StudioDraftRow[] } | null) => {
        if (!cancelled && data?.data) setDrafts(data.data);
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
  const selectedTextStyle = TEXT_STYLES.find((s) => s.id === textStyle) ?? TEXT_STYLES[0];
  const selectedTextSize = TEXT_SIZES.find((s) => s.id === textSize) ?? TEXT_SIZES[0];
  const selectedTextWidth = TEXT_WIDTHS.find((w) => w.id === textWidth) ?? TEXT_WIDTHS[0];
  const showSlideText = overlays === "text";
  const slideTextConfig: SlideTextConfig = {
    className: selectedTextStyle.className,
    bgEnabled: textBgEnabled,
    bgColor: textBgColor,
    size: textSize,
    width: textWidth,
  };
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
  // Rough placeholder estimate: one generation per slide, at the selected model's per-image credit cost.
  const creditEstimate = slideCount * selectedModel.credits;
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

  function addFiles(files: FileList | null) {
    if (!files) return;
    setRefImages((cur) => {
      const room = REFERENCE_MAX - cur.length;
      const next = Array.from(files)
        .slice(0, Math.max(0, room))
        .map((f) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(f), name: f.name }));
      return [...cur, ...next];
    });
  }

  function removeRef(id: string) {
    setRefImages((cur) => {
      const gone = cur.find((r) => r.id === id);
      if (gone?.url.startsWith("blob:")) URL.revokeObjectURL(gone.url);
      return cur.filter((r) => r.id !== id);
    });
  }

  // Clamps to [SLIDE_MIN, SLIDE_MAX] and resizes the per-slide arrays to
  // match — shared by the +/- buttons and direct number entry.
  function setSlides(target: number) {
    if (!Number.isFinite(target)) return;
    const next = Math.min(SLIDE_MAX, Math.max(SLIDE_MIN, Math.round(target)));
    setSlideCount(next);
    setSlideSources((s) => (s.length >= next ? s.slice(0, next) : [...s, ...Array(next - s.length).fill("auto")]));
    setSlideUploads((s) => (s.length >= next ? s.slice(0, next) : [...s, ...Array(next - s.length).fill(undefined)]));
    setSlideTexts((s) => (s.length >= next ? s.slice(0, next) : [...s, ...Array(next - s.length).fill("")]));
    setSlideTextPos((s) => (s.length >= next ? s.slice(0, next) : [...s, ...Array(next - s.length).fill({ x: 50, y: 82 })]));
  }
  function updateSlideText(index: number, text: string) {
    setSlideTexts((s) => s.map((v, i) => (i === index ? text.slice(0, SLIDE_TEXT_MAX) : v)));
  }
  function updateSlideTextPos(index: number, pos: { x: number; y: number }) {
    setSlideTextPos((s) => s.map((v, i) => (i === index ? pos : v)));
  }
  function growSlides() {
    setSlides(slideCount + 1);
  }
  function shrinkSlides() {
    setSlides(slideCount - 1);
  }
  function updateSlideSource(index: number, id: string) {
    setSlideSources((s) => s.map((v, i) => (i === index ? id : v)));
    // "Uploaded Images" needs an actual photo for this slide — never borrow
    // one from the reference pool, so prompt a file picker right away.
    if (id === "upload") {
      setUploadTargetIndex(index);
      slideUploadInput.current?.click();
    }
  }

  function pickSlideUpload(files: FileList | null) {
    const file = files?.[0];
    const targetIndex = uploadTargetIndex;
    setUploadTargetIndex(null);
    if (!file || targetIndex === null) return;
    setSlideUploads((cur) => {
      const prev = cur[targetIndex];
      if (prev?.url.startsWith("blob:")) URL.revokeObjectURL(prev.url);
      const next = [...cur];
      next[targetIndex] = { id: crypto.randomUUID(), url: URL.createObjectURL(file), name: file.name };
      return next;
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
      setSlideTexts(Array(template.slides).fill(""));
      setSlideTextPos(Array(template.slides).fill({ x: 50, y: 82 }));
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

  // Pulls the real post (caption + cover image) server-side, evaluates it into
  // an editable context brief, and lands the user in the Custom editor.
  async function applyCopiedSlideshow() {
    const link = slideshowReference.trim();
    if (!link || copyBusy) return;
    if (!copyAcknowledged) {
      setCopyError("Please accept the content policy to continue.");
      return;
    }
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
        images?: string[];
        context?: string;
        error?: { message?: string };
      };
      if (!response.ok || !data.context) {
        throw new Error(data.error?.message ?? "Couldn't copy that post.");
      }

      setContext(data.context);
      setAspect(data.platform === "Instagram" ? "4:5" : "9:16");
      setOverlays("text");

      const pulled = (data.images ?? []).slice(0, REFERENCE_MAX);
      if (pulled.length) {
        // These are reference-only: inspiration for new AI-generated slides,
        // never the literal images we post — hence "ai", not "upload".
        setRefImages(pulled.map((url, i) => ({ id: crypto.randomUUID(), url, name: `Reference ${i + 1}` })));
        const next = Math.min(SLIDE_MAX, Math.max(pulled.length, 3));
        setSlideCount(next);
        setSlideSources(Array(next).fill("ai"));
        setSlideUploads(Array(next).fill(undefined));
        setSlideTexts(Array(next).fill(""));
        setSlideTextPos(Array(next).fill({ x: 50, y: 82 }));
      }

      setCopyModalOpen(false);
      setCopyAcknowledged(false);
      setDraftOrigin("copy");
      setDraftPlatform(data.platform ?? null);
      setMode("custom");
      setStep(0);
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
      slideTexts,
      slideTextPos,
      refImages: remoteRefImages,
      platformCaptions,
      aiModel,
      aspect,
      overlays,
      language,
      slideCategory,
      textStyle,
      textBgEnabled,
      textBgColor,
      textSize,
      textWidth,
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
    setSlideTexts(p.slideTexts ?? []);
    setSlideTextPos(p.slideTextPos ?? []);
    setRefImages(p.refImages ?? []);
    setPlatformCaptions(p.platformCaptions ?? {});
    setAiModel(p.aiModel ?? "nano-banana-2");
    setAspect(p.aspect ?? "9:16");
    setOverlays(p.overlays ?? "none");
    setLanguage(p.language ?? "en");
    setSlideCategory(p.slideCategory ?? "educational");
    setTextStyle(p.textStyle ?? "shadow");
    setTextBgEnabled(p.textBgEnabled ?? false);
    setTextBgColor(p.textBgColor ?? "#000000");
    setTextSize(p.textSize ?? "small");
    setTextWidth(p.textWidth ?? "narrow");
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
    slideTexts,
    slideTextPos,
    refImages,
    platformCaptions,
    aiModel,
    aspect,
    overlays,
    language,
    slideCategory,
    textStyle,
    textBgEnabled,
    textBgColor,
    textSize,
    textWidth,
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
        body: JSON.stringify({ platform: platformId, context, campaignName }),
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
        {isSettingsStep && (
          <>
            <button type="button" className="btn-subtle !py-1.5 text-sm">
              <Icon name="file" size={15} /> <span className="hidden sm:inline">Save as Template</span>
              <span className="sm:hidden">Save</span>
            </button>
            <button
              type="button"
              className="btn-subtle !h-9 !w-9 !p-0"
              title="Version history"
              aria-label="Version history"
            >
              <Icon name="clock" size={16} />
            </button>
          </>
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
            {mode === "custom" ? "Review" : "Continue"} <Icon name="chevronRight" size={15} />
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
            pickSlideUpload(e.target.files);
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
                  <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-line bg-page/50 px-3 py-2 text-sm font-semibold text-muted">
                    {referencePlatformIconId(slideshowReference) && (
                      <PlatformIcon id={referencePlatformIconId(slideshowReference)!} size={14} />
                    )}
                    Reference: {platformFromSlideshowUrl(slideshowReference)} slideshow
                  </div>
                )}
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {refImages.map((r) => (
                    <div key={r.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                      <img src={r.url} alt={r.name} className="h-full w-full object-cover" />
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

              {/* Generation settings — model, aspect, overlays, language — apply to
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
                      {AI_MODELS.map((m) => (
                        <MenuRow key={m.id} active={m.id === aiModel} onClick={() => { setAiModel(m.id); close(); }}>
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold">{m.name}</span>
                            <span className="block truncate text-xs text-muted">{m.desc}</span>
                          </span>
                          <CreditBadge credits={m.credits} active={m.id === aiModel} />
                        </MenuRow>
                      ))}
                    </>
                  )}
                </Popover>

                <Popover
                  width="min-w-[18rem]"
                  trigger={(open) => (
                    <ToolbarButton open={open} icon="image" muted>
                      {aspect}
                    </ToolbarButton>
                  )}
                >
                  {(close) => (
                    <>
                      {ASPECTS.map((a) => (
                        <MenuRow key={a.id} active={a.id === aspect} onClick={() => { setAspect(a.id); close(); }}>
                          <span className="w-12 text-lg font-bold">{a.name}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-muted">{a.hint}</span>
                            <span className="block text-xs text-muted/70">{a.px}</span>
                          </span>
                          {a.id === aspect && <Icon name="check" size={15} className="ml-auto text-primary-deep" />}
                        </MenuRow>
                      ))}
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

              <div
                className="mt-4 grid gap-4"
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
                    showText={showSlideText}
                    text={slideTexts[i] ?? ""}
                    onTextChange={(t) => updateSlideText(i, t)}
                    textPos={slideTextPos[i] ?? { x: 50, y: 82 }}
                    onTextPosChange={(p) => updateSlideTextPos(i, p)}
                    textConfig={slideTextConfig}
                  />
                ))}
              </div>
              {showSlideText && (
                <p className="mt-2 text-xs text-muted">
                  Drag the text on a slide to reposition it. Styling applies to every slide.
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
              <button
                type="button"
                onClick={() => setAdvancedTextOpen((v) => !v)}
                className="flex items-center gap-2 text-sm font-bold text-muted transition-colors hover:text-primary-deep"
              >
                <Icon name="gear" size={16} />
                Advanced Text Settings
                <Icon name={advancedTextOpen ? "chevronUp" : "chevronDown"} size={15} />
              </button>

              {advancedTextOpen && (
                <div className="mt-4 grid gap-6 rounded-xl border border-line bg-page/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Font Size</p>
                    <div className="flex flex-wrap gap-1">
                      {TEXT_SIZES.map((size) => (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => {
                            setTextSize(size.id);
                            setOverlays("text");
                          }}
                          className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                            textSize === size.id
                              ? "border border-primary bg-white text-primary-deep"
                              : "border border-transparent text-muted hover:text-ink"
                          }`}
                        >
                          {size.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Text Width</p>
                    <div className="flex flex-wrap gap-1">
                      {TEXT_WIDTHS.map((width) => (
                        <button
                          key={width.id}
                          type="button"
                          onClick={() => {
                            setTextWidth(width.id);
                            setOverlays("text");
                          }}
                          className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                            textWidth === width.id
                              ? "border border-primary bg-white text-primary-deep"
                              : "border border-transparent text-muted hover:text-ink"
                          }`}
                        >
                          {width.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Style</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {TEXT_STYLES.map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => {
                            setTextStyle(style.id);
                            setOverlays("text");
                          }}
                          aria-pressed={textStyle === style.id}
                          className={`flex h-12 items-center justify-center rounded-lg border p-1.5 transition-colors ${
                            textStyle === style.id
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-line hover:border-primary/50"
                          }`}
                          title={style.name}
                        >
                          {/* Neutral gradient stands in for a photo backdrop, so
                              white-text styles stay legible in the preview. */}
                          <span className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-slate-300 via-slate-400 to-slate-600">
                            <span
                              className={`rounded px-1.5 py-0.5 text-sm font-black ${style.className}`}
                              style={textBgEnabled ? { backgroundColor: textBgColor } : undefined}
                            >
                              Aa
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-muted">Text Background</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setTextBgEnabled(false)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                          !textBgEnabled
                            ? "border border-primary bg-white text-primary-deep"
                            : "border border-transparent text-muted hover:text-ink"
                        }`}
                      >
                        None
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextBgEnabled(true)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                          textBgEnabled
                            ? "border border-primary bg-white text-primary-deep"
                            : "border border-transparent text-muted hover:text-ink"
                        }`}
                      >
                        Color
                      </button>
                      {textBgEnabled && (
                        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1">
                          <input
                            type="color"
                            value={textBgColor}
                            onChange={(e) => setTextBgColor(e.target.value)}
                            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                            aria-label="Text background color"
                          />
                          <span className="font-mono text-xs text-muted">{textBgColor}</span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-6">
              <FieldLabel icon="type">Platform Descriptions</FieldLabel>
              {selectedPlatforms.size === 0 ? (
                <p className="mt-2 text-sm text-muted">Select accounts under Post To to write a description for each platform.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-3">
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
                  showText={showSlideText}
                  text={slideTexts[i] ?? ""}
                  onTextChange={(t) => updateSlideText(i, t)}
                  textPos={slideTextPos[i] ?? { x: 50, y: 82 }}
                  onTextPosChange={(p) => updateSlideTextPos(i, p)}
                  textConfig={slideTextConfig}
                />
              ))}
            </div>
          </div>
        )}

        {isReviewStep && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Campaign", campaignName || "Untitled campaign"],
                ["Publishing", publishedLabel],
                ["Slides per show", `${slideCount} slides`],
                ["Category", selectedCategory.name],
                ["Aspect", `${selectedAspect.name} · ${selectedAspect.hint}`],
                ["Overlays", selectedOverlay.name],
                ["Text style", `${selectedTextStyle.name} · ${selectedTextSize.name} · ${selectedTextWidth.name}`],
                ["Language", `${selectedLanguage.flag} ${selectedLanguage.name}`],
                ["AI model", `${selectedModel.name} (${selectedModel.credits}cr/image)`],
                ["Translation", translationMode === "same" ? "Same as primary" : selectedTranslationLanguage.name],
                ["Estimated cost", `~${creditEstimate.toLocaleString()} credits`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-page/60 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">{label}</p>
                  <p className="mt-1 font-bold text-ink">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-line bg-white p-4">
              <FieldLabel>Context</FieldLabel>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{context}</p>
            </div>
            {[...selectedPlatforms].some((id) => platformCaptions[id]?.trim()) && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
                <FieldLabel>Platform Descriptions</FieldLabel>
                {[...selectedPlatforms]
                  .filter((id) => platformCaptions[id]?.trim())
                  .map((id) => (
                    <div key={id}>
                      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-muted">
                        <PlatformIcon id={id} size={12} /> {platformOf(id)?.name ?? id}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{platformCaptions[id]}</p>
                    </div>
                  ))}
              </div>
            )}
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
        )}
      </div>

      {draftStatusPill && <div className="mt-4 flex justify-center">{draftStatusPill}</div>}

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
