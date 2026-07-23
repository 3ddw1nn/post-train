"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "./icons";
import { PlatformIcon } from "./platform-icon";

const CUSTOM_STEPS = ["Settings", "Review & Launch"] as const;
const TEMPLATE_STEPS = ["Templates", "Settings", "Images", "Launch"] as const;
const REFERENCE_MAX = 5;
const CONTEXT_MAX = 1200;
const STYLE_PROMPT_MAX = 1200;
const SLIDE_MIN = 1;
const SLIDE_MAX = 10;

const SLIDE_SOURCES = [
  { id: "auto", name: "Auto", short: "Auto", icon: "sparkles", desc: "Let Post Train pick the best source." },
  { id: "ai", name: "AI Generated", short: "AI", icon: "sparkles", desc: "Generate images from your prompt." },
  { id: "upload", name: "Uploaded Images", short: "Uploaded", icon: "upload", desc: "Use your own photos." },
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
  { id: "9:16", name: "9:16", hint: "Portrait (TikTok, Reels)" },
  { id: "3:4", name: "3:4", hint: "Portrait (Pinterest, Threads)" },
  { id: "4:5", name: "4:5", hint: "Portrait (Instagram Feed)" },
  { id: "1:1", name: "1:1", hint: "Square (Instagram)" },
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

const TEXT_STYLES = [
  { id: "shadow", name: "Shadow", className: "text-white [text-shadow:0_2px_0_rgba(0,0,0,0.85)]" },
  { id: "boxed", name: "Boxed", className: "bg-ink px-2 py-0.5 text-white" },
  { id: "pill", name: "Pill", className: "rounded-md bg-white px-2 py-0.5 text-ink shadow-sm" },
  { id: "plain", name: "Plain", className: "text-white" },
  { id: "dark_pill", name: "Dark pill", className: "rounded-md bg-black px-2 py-0.5 text-white" },
  { id: "minimal", name: "Minimal", className: "text-ink" },
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

function aspectClass(aspect: (typeof ASPECTS)[number]["id"]) {
  switch (aspect) {
    case "1:1":
      return "aspect-square";
    case "3:4":
      return "aspect-[3/4]";
    case "4:5":
      return "aspect-[4/5]";
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
function SlideSourceControl({ value, onChange }: { value: string; onChange: (id: string) => void }) {
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/95 px-2.5 py-1.5 text-xs font-extrabold text-primary-deep shadow-sm backdrop-blur transition-colors hover:border-primary"
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
                  <span className="block truncate text-xs text-muted">{s.desc}</span>
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

function SlideStructureCard({
  index,
  source,
  onSourceChange,
  referenceImage,
  aspect,
}: {
  index: number;
  source: string;
  onSourceChange: (id: string) => void;
  referenceImage?: RefImage;
  aspect: (typeof ASPECTS)[number]["id"];
}) {
  return (
    <div
      className={`group relative min-w-[165px] flex-1 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary-soft/70 via-white to-page shadow-sm ${aspectClass(aspect)}`}
    >
      {referenceImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview.
        <img src={referenceImage.url} alt={referenceImage.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,139,128,0.2),transparent_35%),linear-gradient(145deg,rgba(16,139,128,0.12),rgba(255,255,255,0.72))]" />
          <span className="relative z-10 rotate-[-8deg] text-2xl font-black leading-[0.82] text-primary-deep/35">
            POST<br />TRAIN
          </span>
        </div>
      )}
      <div className="absolute left-3 top-3">
        <SlideSourceControl value={source} onChange={onSourceChange} />
      </div>
      <div className="absolute bottom-3 right-3 flex items-end justify-between text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/80 text-sm font-black">
          {index + 1}
        </span>
      </div>
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
}: {
  open: boolean;
  link: string;
  onLinkChange: (value: string) => void;
  onClose: () => void;
  onFetch: () => void;
}) {
  if (!open) return null;
  const platform = platformFromSlideshowUrl(link);
  const canFetch = /^https?:\/\/.+/i.test(link.trim());

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
                Paste link, preview slides, choose backgrounds
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
            Paste a TikTok or Instagram photo/slideshow link. We’ll create a draft slideshow structure
            with matched style context and reusable backgrounds.
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
              Fetch
            </button>
          </div>
          <p className="mt-3 text-xs font-semibold text-muted">
            Note: true automatic slide extraction needs a compliant data provider. This creates the draft structure now,
            and the extraction hook can plug in later.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SlideshowStudio({
  initialSlideTexts,
}: {
  initialSlideTexts?: string[];
  sourceExploreItemId?: string;
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
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [stylePrompt, setStylePrompt] = useState("");
  const [styleBusy, setStyleBusy] = useState(false);
  const [styleError, setStyleError] = useState("");
  const [aiModel, setAiModel] = useState<(typeof AI_MODELS)[number]["id"]>("nano-banana-2");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]["id"]>("9:16");
  const [overlays, setOverlays] = useState<(typeof OVERLAYS)[number]["id"]>("none");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]["id"]>("en");
  const [slideCategory, setSlideCategory] = useState<SlideCategoryId>("educational");
  const [advancedTextOpen, setAdvancedTextOpen] = useState(true);
  const [textStyle, setTextStyle] = useState<(typeof TEXT_STYLES)[number]["id"]>("shadow");
  const [textSize, setTextSize] = useState<(typeof TEXT_SIZES)[number]["id"]>("small");
  const [textWidth, setTextWidth] = useState<(typeof TEXT_WIDTHS)[number]["id"]>("narrow");
  const [translationMode, setTranslationMode] = useState<"same" | (typeof LANGUAGES)[number]["id"]>("same");
  const [slideshowReference, setSlideshowReference] = useState("");
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => refImages.forEach((r) => URL.revokeObjectURL(r.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAspect = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
  const selectedOverlay = OVERLAYS.find((o) => o.id === overlays) ?? OVERLAYS[0];
  const selectedLanguage = LANGUAGES.find((l) => l.id === language) ?? LANGUAGES[0];
  const selectedCategory = SLIDE_CATEGORIES.find((c) => c.id === slideCategory) ?? SLIDE_CATEGORIES[0];
  const selectedModel = AI_MODELS.find((m) => m.id === aiModel) ?? AI_MODELS[0];
  const selectedTextStyle = TEXT_STYLES.find((s) => s.id === textStyle) ?? TEXT_STYLES[0];
  const selectedTextSize = TEXT_SIZES.find((s) => s.id === textSize) ?? TEXT_SIZES[0];
  const selectedTextWidth = TEXT_WIDTHS.find((w) => w.id === textWidth) ?? TEXT_WIDTHS[0];
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

  const steps = mode === "templates" ? TEMPLATE_STEPS : CUSTOM_STEPS;
  const isSettingsStep = (mode === "custom" && step === 0) || (mode === "templates" && step === 1);
  const isImagesStep = mode === "templates" && step === 2;
  const isReviewStep = (mode === "custom" && step === 1) || (mode === "templates" && step === 3);
  const isTemplatesStep = mode === "templates" && step === 0;

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
      if (gone) URL.revokeObjectURL(gone.url);
      return cur.filter((r) => r.id !== id);
    });
  }

  function growSlides() {
    setSlideCount((n) => {
      const next = Math.min(SLIDE_MAX, n + 1);
      setSlideSources((s) => (s.length >= next ? s : [...s, ...Array(next - s.length).fill("auto")]));
      return next;
    });
  }
  function shrinkSlides() {
    setSlideCount((n) => {
      const next = Math.max(SLIDE_MIN, n - 1);
      setSlideSources((s) => s.slice(0, next));
      return next;
    });
  }
  function updateSlideSource(index: number, id: string) {
    setSlideSources((s) => s.map((v, i) => (i === index ? id : v)));
  }

  async function generateStylePrompt() {
    if (styleBusy) return;
    setStyleBusy(true);
    setStyleError("");
    try {
      const response = await fetch("/api/app/studio/style-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName,
          context,
          aspect,
          overlays,
          language: selectedLanguage.name,
          category: selectedCategory.name,
          textStyle: selectedTextStyle.name,
          textSize: selectedTextSize.name,
          textWidth: selectedTextWidth.name,
          translationLanguage: selectedTranslationLanguage.name,
          referenceImageCount: refImages.length,
          referenceImageNames: refImages.map((r) => r.name),
          slideshowReference,
        }),
      });
      const data = (await response.json()) as { prompt?: string; error?: { message?: string } };
      if (!response.ok || !data.prompt) {
        throw new Error(data.error?.message ?? "Couldn't generate a style prompt.");
      }
      setStylePrompt(data.prompt.slice(0, STYLE_PROMPT_MAX));
    } catch (e) {
      setStyleError(e instanceof Error ? e.message : "Couldn't generate a style prompt.");
    } finally {
      setStyleBusy(false);
    }
  }

  // Selecting a template pre-fills the settings step, then advances.
  function applyTemplate(id: string) {
    const template = QUICK_TEMPLATES.find((t) => t.id === id);
    if (template) {
      setSlideCategory(template.category);
      setSlideCount(template.slides);
      setSlideSources(Array(template.slides).fill("auto"));
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
  }

  function applyCopiedSlideshow() {
    const link = slideshowReference.trim();
    if (!link) return;
    const platform = platformFromSlideshowUrl(link);
    setSlideCount((current) => {
      const next = Math.min(SLIDE_MAX, Math.max(current, 5));
      setSlideSources((s) => (s.length >= next ? s.slice(0, next) : [...s, ...Array(next - s.length).fill("auto")]));
      return next;
    });
    setAspect(platform === "Instagram" ? "4:5" : "9:16");
    setOverlays("text");
    setContext((current) => {
      const line = `Copy structure from ${platform} slideshow: ${link}`;
      return current.trim() ? `${current.trim()}\n\n${line}` : line;
    });
    setStylePrompt((current) =>
      current.trim()
        ? current
        : `Match the visual rhythm of the referenced ${platform} slideshow: bold hook-first composition, cohesive slide-to-slide pacing, creator-style mobile framing, clear text-safe negative space, and background imagery that supports the same story arc without directly copying the original assets.`,
    );
    setCopyModalOpen(false);
    // Land in the Custom editor with the copied draft applied.
    setMode("custom");
    setStep(0);
  }

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

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link
          href="/dashboard/content-studio"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep"
        >
          <Icon name="chevronLeft" size={15} /> Content Studio
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-contrast">
            <Icon name="stack" size={18} />
          </span>
          Slide Show Studio
        </h1>
      </div>
      {mode !== "choose" && (
        <button type="button" onClick={() => enterMode("choose")} className="btn-subtle !py-1.5 text-sm">
          <Icon name="refresh" size={15} /> Change type
        </button>
      )}
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
        <CopySlideshowModal
          open={copyModalOpen}
          link={slideshowReference}
          onLinkChange={setSlideshowReference}
          onClose={() => setCopyModalOpen(false)}
          onFetch={applyCopiedSlideshow}
        />
      </div>
    );
  }

  const stepBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Step {step + 1} of {steps.length}
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
        <Stepper steps={steps} current={step} />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        {stepBar}

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
              <FieldLabel icon="cube">Context</FieldLabel>
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
                <FieldLabel icon="filter">Slide Structure</FieldLabel>
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
                  <span className="min-w-6 text-center text-lg font-black text-ink">{slideCount}</span>
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
              <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
                {slideSources.map((source, i) => (
                  <SlideStructureCard
                    key={i}
                    index={i}
                    source={source}
                    onSourceChange={(id) => updateSlideSource(i, id)}
                    referenceImage={refImages[i % Math.max(1, refImages.length)]}
                    aspect={aspect}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-muted">
                <span>{aspect}</span>
                <span className="text-line">·</span>
                <span
                  className={
                    overlays !== "none"
                      ? "inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 font-bold text-primary-deep"
                      : "inline-flex items-center gap-1.5"
                  }
                >
                  <Icon name="type" size={14} />
                  {selectedOverlay.name}
                </span>
                <span className="text-line">·</span>
                <span>{selectedLanguage.flag} {selectedLanguage.name}</span>
              </div>
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
                <div className="mt-4 grid gap-6 rounded-xl border border-line bg-page/50 p-4 sm:grid-cols-3">
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
                          className={`flex h-10 items-center justify-center rounded-lg border bg-slate-700 text-sm font-black transition-all ${
                            textStyle === style.id
                              ? "border-primary ring-2 ring-primary/40"
                              : "border-line hover:border-primary/60"
                          }`}
                          title={style.name}
                        >
                          <span className={style.className}>Aa</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-muted">
                    <Icon name="image" size={14} />
                    Visual Style
                    <span className="normal-case font-semibold text-muted/70">· for AI-generated images</span>
                  </p>
                </div>
                <Popover
                  width="min-w-[21rem]"
                  align="right"
                  trigger={(open) => (
                    <span
                      className={`inline-flex items-center gap-2 rounded-xl border border-dashed px-4 py-2 text-sm font-extrabold transition-colors ${
                        open
                          ? "border-primary bg-primary-soft text-primary-deep"
                          : "border-primary/60 bg-white text-primary-deep hover:bg-primary-soft/60"
                      }`}
                    >
                      <Icon name="plus" size={16} /> New Style
                    </span>
                  )}
                >
                  {(close) => (
                    <>
                      <p className="px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-muted">
                        New Visual Style
                      </p>
                      <MenuRow
                        onClick={() => {
                          fileInput.current?.click();
                          close();
                        }}
                      >
                        <Icon name="upload" size={20} className="text-primary" />
                        <span>
                          <span className="block font-bold">Upload images</span>
                          <span className="block text-sm text-muted">Up to 5 reference shots from your device</span>
                        </span>
                      </MenuRow>
                      <MenuRow
                        onClick={() => {
                          setCopyModalOpen(true);
                          close();
                        }}
                      >
                        <Icon name="link" size={20} className="text-primary" />
                        <span>
                          <span className="block font-bold">Copy slideshow from TikTok or Instagram</span>
                          <span className="block text-sm text-muted">Paste a photo-post link and create a draft</span>
                        </span>
                      </MenuRow>
                    </>
                  )}
                </Popover>
              </div>

              <div className="mt-3 flex items-center gap-1 border-b border-line">
                {(["mine", "public"] as const).map((tab) => (
                  <span
                    key={tab}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${
                      tab === "mine" ? "border-primary text-primary-deep" : "border-transparent text-muted"
                    }`}
                  >
                    {tab === "mine" ? "My Styles" : "Public"}
                    {tab === "public" && (
                      <span className="ml-1.5 rounded-full bg-page px-1.5 py-0.5 text-xs text-muted">17</span>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-page/30 px-4 py-6 text-center">
                <p className="text-sm text-muted">
                  No styles yet — create one with the button below or upload references under Visual Style
                </p>
                <button type="button" className="btn-subtle !py-1.5 text-sm">
                  <Icon name="plus" size={15} /> New Style
                </button>
              </div>

              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between">
                    <FieldLabel>Reference Images</FieldLabel>
                    <span className="text-xs font-semibold text-muted">
                      {refImages.length}/{REFERENCE_MAX}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
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
                  {slideshowReference && (
                    <div className="mt-3 rounded-xl border border-line bg-page/50 px-3 py-2 text-sm font-semibold text-muted">
                      Reference: {platformFromSlideshowUrl(slideshowReference)} slideshow
                    </div>
                  )}
                </div>

                <div>
                  <FieldLabel>Style Prompt</FieldLabel>
                  <textarea
                    className="input mt-2 min-h-[100px] resize-y"
                    maxLength={STYLE_PROMPT_MAX}
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                    placeholder="Describe the visual style you want (or analyze images to auto-generate)…"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={generateStylePrompt}
                      disabled={styleBusy || (!context.trim() && !refImages.length && !slideshowReference.trim())}
                      className="btn-primary !py-1.5 text-sm disabled:opacity-50"
                    >
                      {styleBusy ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                      ) : (
                        <Icon name="sparkles" size={14} />
                      )}
                      {styleBusy ? "Analyzing…" : "Analyze Images"}
                    </button>
                    <button type="button" className="btn-subtle !py-1.5 text-sm">
                      <Icon name="file" size={14} /> Generate template prompt
                    </button>
                  </div>
                  {styleError && <p className="mt-2 text-sm font-semibold text-red-600">{styleError}</p>}
                </div>
              </div>
            </section>

            {/* Generation settings — model, aspect, overlays, language. */}
            <section className="mt-6">
              <FieldLabel icon="sparkles">Generation Settings</FieldLabel>
              <div className="mt-2 flex flex-wrap items-center gap-2">
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
                          <span className="text-sm text-muted">{a.hint}</span>
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
            <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
              {slideSources.map((source, i) => (
                <SlideStructureCard
                  key={i}
                  index={i}
                  source={source}
                  onSourceChange={(id) => updateSlideSource(i, id)}
                  referenceImage={refImages[i % Math.max(1, refImages.length)]}
                  aspect={aspect}
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
            {stylePrompt.trim() && (
              <div className="mt-4 rounded-xl border border-line bg-white p-4">
                <FieldLabel>Style Prompt</FieldLabel>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{stylePrompt}</p>
              </div>
            )}
          </>
        )}
      </div>

      <CopySlideshowModal
        open={copyModalOpen}
        link={slideshowReference}
        onLinkChange={setSlideshowReference}
        onClose={() => setCopyModalOpen(false)}
        onFetch={applyCopiedSlideshow}
      />
    </div>
  );
}
