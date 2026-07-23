"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";
import { PlatformIcon } from "../platform-icon";

type TrendPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "pinterest"
  | "twitter"
  | "linkedin"
  | "facebook"
  | "bluesky"
  | "mastodon"
  | "threads";

type TrendAspect = "vertical" | "wide" | "square" | "portrait";
type TrendFormat = "video" | "slideshow" | "source";
type ContentTypeFilter = "all" | "text" | "photos" | "videos";
type DisplayStat = "views" | "likes" | "comments" | "saves";
type ApiBackedPlatform = Extract<TrendPlatform, "youtube" | "bluesky" | "mastodon">;

type TrendItem = {
  id: string;
  platform: TrendPlatform;
  platformIconId?: string;
  source: string;
  title: string;
  creator: string;
  caption: string;
  category: string;
  format: TrendFormat;
  aspect: TrendAspect;
  isShort?: boolean;
  tags: string[];
  thumbnail?: string;
  videoId?: string;
  slides?: number;
  postedAt?: string;
  publishedAt?: string; // ISO timestamp for date sorting
  authorAvatar?: string;
  followers?: string;
  sourceUrl: string | ((q: string) => string);
  stats: {
    views: string;
    likes: string;
    comments: string;
    shares: string;
    saves?: string;
  };
};

// "youtube-shorts" is a source variant, not a real platform: its items come back
// as platform "youtube" with isShort=true. It drives a Shorts-specific fetch.
type PlatformFilter = TrendPlatform | "youtube-shorts";

const PLATFORMS: { id: "all" | PlatformFilter; label: string; iconId?: string; disabled?: boolean; note?: string }[] = [
  { id: "all", label: "All" },
  { id: "bluesky", label: "Bluesky", iconId: "bluesky" },
  { id: "mastodon", label: "Mastodon", iconId: "mastodon" },
  { id: "twitter", label: "Twitter/X", iconId: "twitter" },
  { id: "instagram", label: "Instagram", iconId: "instagram", disabled: true },
  { id: "linkedin", label: "LinkedIn", iconId: "linkedin" },
  { id: "facebook", label: "Facebook", iconId: "facebook" },
  { id: "tiktok", label: "TikTok", iconId: "tiktok", disabled: true },
  { id: "youtube", label: "YouTube", iconId: "youtube" },
  { id: "youtube-shorts", label: "YouTube Shorts", iconId: "youtube" },
  { id: "threads", label: "Threads", iconId: "threads" },
  { id: "pinterest", label: "Pinterest", iconId: "pinterest" },
];

const ASPECTS: { id: "all" | TrendAspect; label: string; ratio: string; shape: string }[] = [
  { id: "all", label: "All formats", ratio: "Mosaic", shape: "h-4 w-4" },
  { id: "wide", label: "Wide", ratio: "16:9", shape: "h-3 w-6" },
  { id: "vertical", label: "Vertical", ratio: "9:16", shape: "h-6 w-3" },
  { id: "square", label: "Square", ratio: "1:1", shape: "h-5 w-5" },
  { id: "portrait", label: "Portrait", ratio: "4:5", shape: "h-6 w-5" },
];

const SORTS = [
  { id: "recently-added", label: "Recently added", icon: "clock" },
  { id: "oldest-added", label: "Oldest added", icon: "clock" },
  { id: "latest-posted", label: "Latest posted", icon: "calendar" },
  { id: "oldest-posted", label: "Oldest posted", icon: "calendar" },
  { id: "views", label: "Most views", icon: "eye" },
  { id: "likes", label: "Most likes", icon: "heart" },
  { id: "comments", label: "Most comments", icon: "comment" },
  { id: "slides", label: "Most slides", icon: "stack" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

const CONTENT_TYPES: { id: ContentTypeFilter; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "sparkles" },
  { id: "text", label: "Text", icon: "type" },
  { id: "photos", label: "Photo", icon: "image" },
  { id: "videos", label: "Video", icon: "video" },
];

// Which content types each source can surface. Selecting a type hides the sources
// that don't support it. Based on where each format actually lives.
const PLATFORM_CAPS: Record<PlatformFilter, ContentTypeFilter[]> = {
  twitter: ["text", "photos", "videos"],
  instagram: ["photos", "videos"],
  linkedin: ["text", "photos", "videos"],
  facebook: ["text", "photos", "videos"],
  tiktok: ["photos", "videos"],
  youtube: ["videos"],
  "youtube-shorts": ["videos"],
  bluesky: ["text", "photos", "videos"],
  mastodon: ["text", "photos", "videos"],
  threads: ["text", "photos", "videos"],
  pinterest: ["photos", "videos"],
};

function platformSupportsType(id: PlatformFilter, type: ContentTypeFilter) {
  return type === "all" || (PLATFORM_CAPS[id]?.includes(type) ?? false);
}

const DISPLAY_STATS: { id: DisplayStat; label: string; icon: string }[] = [
  { id: "views", label: "Views", icon: "eye" },
  { id: "likes", label: "Likes", icon: "heart" },
  { id: "comments", label: "Comments", icon: "comment" },
  { id: "saves", label: "Saves", icon: "bookmark" },
];

const YOUTUBE_REGIONS: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "BR", label: "Brazil" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "MX", label: "Mexico" },
  { code: "NG", label: "Nigeria" },
];

const API_BACKED_PLATFORMS: ApiBackedPlatform[] = ["youtube", "bluesky", "mastodon"];
const API_SOURCES = ["youtube", "youtube-shorts", "bluesky", "mastodon"] as const;
type ApiSource = (typeof API_SOURCES)[number];
const LIVE_FETCH_TIMEOUT_MS = 12_000;

type PlatformStatus = "idle" | "loading" | "ready" | "timeout" | "error";

function platformLabel(platform: TrendPlatform) {
  return PLATFORMS.find((p) => p.id === platform)?.label ?? platform;
}

function resolveSourceUrl(item: TrendItem, query: string) {
  return typeof item.sourceUrl === "function" ? item.sourceUrl(query) : item.sourceUrl;
}

// Regular YouTube and YouTube Shorts share platform "youtube" and split on isShort;
// every other source matches its platform directly.
function itemMatchesSources(item: TrendItem, sources: PlatformFilter[]) {
  return sources.some((source) => {
    if (source === "youtube") return item.platform === "youtube" && !item.isShort;
    if (source === "youtube-shorts") return item.platform === "youtube" && Boolean(item.isShort);
    return item.platform === source;
  });
}

function normalizeLiveItem(item: TrendItem): TrendItem {
  return {
    ...item,
    aspect: item.aspect ?? "wide",
    category: item.category ?? "YouTube",
    format: item.format ?? "video",
    platformIconId: item.platformIconId ?? "youtube",
    slides: item.slides ?? 1,
    tags: item.tags ?? [],
    stats: {
      ...item.stats,
      saves: item.stats?.saves ?? "—",
    },
  };
}

function parseMetric(value?: string) {
  if (!value) return 0;
  const clean = value.replace(/,/g, "").trim().toLowerCase();
  const match = clean.match(/([\d.]+)/);
  if (!match) return 0;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;
  // Compact-notation suffixes from Intl.NumberFormat (T > B > M > K). Missing the
  // billion/trillion cases ranked "3.4B" below "500M", breaking view/like sorts.
  if (clean.includes("t")) return base * 1_000_000_000_000;
  if (clean.includes("b")) return base * 1_000_000_000;
  if (clean.includes("m")) return base * 1_000_000;
  if (clean.includes("k")) return base * 1_000;
  if (clean.includes("%")) return base;
  return base;
}

// Epoch ms of the item's real publish date (YouTube publishedAt / Bluesky
// indexedAt / Mastodon created_at). Undated items sink to the bottom.
function postedTime(item: TrendItem) {
  const t = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function aspectClass(aspect: TrendAspect) {
  if (aspect === "wide") return "aspect-video";
  if (aspect === "square") return "aspect-square";
  if (aspect === "portrait") return "aspect-[4/5]";
  return "aspect-[9/16]";
}

function detailWidthClass(aspect: TrendAspect) {
  if (aspect === "wide") return "w-full max-w-[980px]";
  if (aspect === "square") return "w-full max-w-[560px]";
  if (aspect === "portrait") return "w-full max-w-[460px]";
  return "w-full max-w-[420px]";
}

function railPreviewHeight(aspect: TrendAspect) {
  if (aspect === "wide") return 150;
  if (aspect === "square") return 180;
  if (aspect === "portrait") return 220;
  return 260;
}

function mosaicSpanClass(item: TrendItem) {
  if (item.aspect === "wide") return "col-span-2 row-span-3";
  if (item.aspect === "vertical") return "row-span-5";
  if (item.aspect === "portrait") return "row-span-4";
  return "row-span-4";
}

function AspectIcon({ aspect, active }: { aspect: (typeof ASPECTS)[number]; active: boolean }) {
  if (aspect.id === "all") {
    return (
      <span className="grid h-6 w-6 grid-cols-2 gap-0.5">
        <span className={`rounded-[3px] ${active ? "bg-white" : "bg-primary"}`} />
        <span className={`rounded-[3px] ${active ? "bg-white/80" : "bg-primary/45"}`} />
        <span className={`rounded-[3px] ${active ? "bg-white/80" : "bg-primary/45"}`} />
        <span className={`rounded-[3px] ${active ? "bg-white" : "bg-primary"}`} />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-7 items-center justify-center">
      <span
        className={`rounded-[4px] border-2 ${aspect.shape} ${
          active ? "border-white bg-white/25" : "border-primary bg-primary-soft"
        }`}
      />
    </span>
  );
}


type SegmentedOption<T extends string> = {
  id: T;
  label: string;
  icon?: string;
  hint?: string;
  renderIcon?: (active: boolean) => React.ReactNode;
};

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.14em] text-muted/70">{label}</span>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-line bg-page p-1">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold transition ${
                active ? "bg-white text-primary-deep shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {opt.renderIcon ? opt.renderIcon(active) : opt.icon ? <Icon name={opt.icon} size={15} /> : null}
              <span>{opt.label}</span>
              {opt.hint && (
                <span className={`text-xs font-semibold ${active ? "text-primary/60" : "text-muted/60"}`}>{opt.hint}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function platformChipClass(platform: TrendPlatform) {
  if (platform === "youtube") return "bg-red-600 text-white";
  if (platform === "tiktok") return "bg-black text-white";
  if (platform === "instagram") return "bg-pink-600 text-white";
  if (platform === "pinterest") return "bg-red-700 text-white";
  if (platform === "twitter") return "bg-black text-white";
  if (platform === "facebook") return "bg-blue-600 text-white";
  if (platform === "bluesky") return "bg-sky-500 text-white";
  if (platform === "mastodon") return "bg-indigo-500 text-white";
  if (platform === "threads") return "bg-black text-white";
  return "bg-blue-700 text-white";
}

function SourceBadge({ item }: { item: TrendItem }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold shadow-sm ${platformChipClass(
        item.platform,
      )}`}
    >
      {item.platformIconId ? (
        <PlatformIcon id={item.platformIconId} size={14} colored={false} />
      ) : (
        <span className="h-2 w-2 rounded-full bg-current" />
      )}
      {platformLabel(item.platform)}
    </span>
  );
}

// The card/badge label reflects the actual content: Video, Photo, or Text.
function contentTypeLabel(item: TrendItem) {
  if (item.format === "video") return "Video";
  if (item.thumbnail) return "Photo";
  return "Text";
}

function FormatBadge({ item }: { item: TrendItem }) {
  return (
    <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-white backdrop-blur">
      {item.slides && item.slides > 1 ? `1/${item.slides}` : contentTypeLabel(item)}
    </span>
  );
}

function ThumbnailArt({
  item,
  className = "",
  compact = false,
}: {
  item: TrendItem;
  className?: string;
  compact?: boolean;
}) {
  if (item.thumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail URLs are external and stable for embeds.
      <img src={item.thumbnail} alt="" className={`h-full w-full object-cover ${className}`} />
    );
  }

  const tint =
    item.platform === "tiktok"
      ? "from-black via-zinc-900 to-primary-deep"
      : item.platform === "instagram"
        ? "from-pink-100 via-orange-50 to-purple-100"
      : item.platform === "pinterest"
          ? "from-red-50 via-white to-primary-soft"
          : item.platform === "facebook"
            ? "from-blue-50 via-white to-primary-soft"
            : item.platform === "bluesky"
              ? "from-sky-50 via-white to-primary-soft"
              : item.platform === "mastodon"
                ? "from-indigo-50 via-white to-primary-soft"
                : item.platform === "threads"
                  ? "from-zinc-50 via-white to-primary-soft"
                  : item.platform === "twitter"
                    ? "from-slate-50 via-white to-primary-soft"
                    : "from-blue-50 via-white to-primary-soft";

  return (
    <div
      className={`flex h-full w-full flex-col justify-between bg-gradient-to-br ${tint} ${
        compact ? "p-3" : "p-4"
      } ${className}`}
    >
      <div />
      <div>
        <p
          className={`${compact ? "max-w-full text-base" : "max-w-[14rem] text-xl"} font-extrabold leading-tight ${
            item.platform === "tiktok" ? "text-white" : "text-ink"
          }`}
        >
          {item.title}
        </p>
        <div className={`${compact ? "mt-3" : "mt-4"} grid grid-cols-4 gap-1.5`}>
          {[42, 68, 36, 82].map((h, i) => (
            <span
              key={i}
              className={`rounded-t-md ${item.platform === "tiktok" ? "bg-white/35" : "bg-primary-soft"}`}
              style={{ height: compact ? Math.max(26, Math.round(h * 0.68)) : h }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon, value }: { icon: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs font-extrabold text-white backdrop-blur">
      <Icon name={icon} size={13} /> {value}
    </span>
  );
}

function RailPreview({ item }: { item: TrendItem }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-page"
      style={{ height: railPreviewHeight(item.aspect) }}
    >
      {item.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- External platform thumbnail used only as a preview.
        <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col justify-end bg-gradient-to-br from-white via-primary-soft/25 to-page p-3">
          <p
            className="text-sm font-black leading-tight text-ink"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.title}
          </p>
          <p className="mt-1 truncate text-[11px] font-bold text-muted">{item.category}</p>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
      <div className="absolute left-2 top-2">
        <FormatBadge item={item} />
      </div>
      <div className="absolute bottom-2 left-2">
        <MiniStat icon="eye" value={item.stats.views} />
      </div>
    </div>
  );
}

function DetailStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="border-r border-line pr-4 last:border-r-0">
      <p className="flex items-center gap-1 text-xl font-black text-ink">
        <Icon name={icon} size={16} className="text-muted" /> {value}
      </p>
      <p className="mt-1 text-[11px] font-extrabold uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function SkeletonMosaicCard({ layout }: { layout: "mosaic" | "grid" }) {
  return (
    <div className={layout === "mosaic" ? "row-span-4" : ""}>
      <div
        className={`h-full animate-pulse overflow-hidden rounded-2xl border border-[rgba(6,63,59,0.13)] bg-white ${
          layout === "mosaic" ? "flex flex-col" : ""
        }`}
      >
        <div className={`bg-page ${layout === "mosaic" ? "min-h-0 flex-1" : "aspect-square"}`} />
        <div className="shrink-0 space-y-1.5 border-t border-line bg-white px-3 py-2.5">
          <div className="h-3 w-3/4 rounded bg-page" />
          <div className="h-2.5 w-1/2 rounded bg-page" />
        </div>
      </div>
    </div>
  );
}

function TrendMosaicCard({
  item,
  onOpen,
  layout,
  displayStats,
}: {
  item: TrendItem;
  onOpen: (item: TrendItem) => void;
  layout: "mosaic" | "grid";
  displayStats: DisplayStat[];
}) {
  const isMosaic = layout === "mosaic";
  const visibleStats: DisplayStat[] = displayStats.length ? displayStats : ["views", "likes"];
  const statValues: Record<DisplayStat, string> = {
    views: item.stats.views,
    likes: item.stats.likes,
    comments: item.stats.comments,
    saves: item.stats.saves ?? "—",
  };
  const statIcons: Record<DisplayStat, string> = {
    views: "eye",
    likes: "heart",
    comments: "comment",
    saves: "bookmark",
  };

  // Text-only social posts (no image/video) get a text-forward card instead of an
  // empty media frame — the words are the content.
  const isTextPost = item.format === "source" && !item.thumbnail;
  if (isTextPost) {
    const tint =
      item.platform === "bluesky"
        ? "from-sky-50 via-white to-sky-50/40"
        : item.platform === "mastodon"
          ? "from-indigo-50 via-white to-indigo-50/40"
          : "from-slate-50 via-white to-slate-50/40";
    return (
      <article className={isMosaic ? mosaicSpanClass(item) : ""}>
        <button
          type="button"
          onClick={() => onOpen(item)}
          className={`group flex w-full flex-col overflow-hidden rounded-2xl border border-[rgba(6,63,59,0.13)] bg-white text-left shadow-[0_7px_14px_rgba(6,63,59,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(6,63,59,0.22)] ${
            isMosaic ? "h-full" : ""
          }`}
        >
          <div
            className={`relative flex min-h-0 flex-1 flex-col justify-between gap-3 bg-gradient-to-br ${tint} p-4 ${
              isMosaic ? "" : "min-h-[180px]"
            }`}
          >
            <div className="flex items-center justify-between">
              <SourceBadge item={item} />
              <span className="font-serif text-3xl leading-none text-primary/30">”</span>
            </div>
            <p
              className="text-[15px] font-bold leading-snug text-ink"
              style={{ display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {item.caption}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {visibleStats.slice(0, 3).map((stat) => (
                <span key={stat} className="inline-flex items-center gap-1 text-xs font-bold text-muted">
                  <Icon name={statIcons[stat]} size={13} /> {statValues[stat]}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0 border-t border-line bg-white px-3 py-2.5">
            <p className="truncate text-sm font-extrabold text-ink">{item.creator}</p>
            <p className="truncate text-xs font-semibold text-muted">
              {item.category} · {item.postedAt ?? "Live"}
            </p>
          </div>
        </button>
      </article>
    );
  }

  return (
    <article className={isMosaic ? mosaicSpanClass(item) : ""}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`group w-full overflow-hidden rounded-2xl border border-[rgba(6,63,59,0.13)] bg-white text-left shadow-[0_7px_14px_rgba(6,63,59,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(6,63,59,0.22)] ${
          isMosaic ? "flex h-full flex-col" : "block"
        }`}
      >
        <div className={`relative overflow-hidden bg-page ${isMosaic ? "min-h-0 flex-1" : aspectClass(item.aspect)}`}>
          <ThumbnailArt item={item} className="transition duration-200 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/20" />
          <div className="absolute left-2.5 top-2.5">
            <FormatBadge item={item} />
          </div>
          <div className="absolute right-2.5 top-2.5">
            <SourceBadge item={item} />
          </div>
          {item.videoId && (
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-xl">
                <span className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-primary-deep" />
              </span>
            </span>
          )}
          <div className="absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center gap-2">
            {visibleStats.slice(0, 3).map((stat) => (
              <MiniStat key={stat} icon={statIcons[stat]} value={statValues[stat]} />
            ))}
          </div>
        </div>
        <div className="shrink-0 border-t border-line bg-white px-3 py-2.5">
          <p className="truncate text-sm font-extrabold text-ink">{item.title}</p>
          <p className="truncate text-xs font-semibold text-muted">
            {item.category} · {item.creator}
          </p>
        </div>
      </button>
    </article>
  );
}

// Compact card for the "Saved" strip and library.
function SavedCard({ item, onOpen }: { item: TrendItem; onOpen: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-40 shrink-0 overflow-hidden rounded-xl border-2 border-primary/25 bg-white text-left shadow-[0_2px_8px_rgba(6,63,59,0.06)] transition hover:border-primary hover:shadow-[0_6px_16px_rgba(6,63,59,0.14)]"
    >
      <div className="relative aspect-square overflow-hidden bg-page">
        {item.thumbnail && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- external thumbnail
          <img
            src={item.thumbnail}
            alt=""
            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.04]"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-end bg-gradient-to-br from-sky-50 via-white to-primary-soft/40 p-2.5">
            <p
              className="text-xs font-bold leading-snug text-ink"
              style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {item.caption}
            </p>
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
          {contentTypeLabel(item)}
        </span>
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shadow-sm">
          <Icon name="bookmark" size={11} className="fill-current" />
        </span>
      </div>
      <p className="truncate px-2 py-1.5 text-xs font-bold text-ink">{item.title}</p>
    </button>
  );
}

function SavedLibrary({
  items,
  displayStats,
  onOpen,
  onRemove,
  onClose,
}: {
  items: TrendItem[];
  displayStats: DisplayStat[];
  onOpen: (item: TrendItem) => void;
  onRemove: (item: TrendItem) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 top-14 z-[100] bg-white/95 backdrop-blur-sm lg:left-[var(--pt-sidebar-width,232px)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-4 border-b border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-muted transition hover:text-primary-deep"
          >
            <Icon name="chevronLeft" size={18} /> Back
          </button>
          <div className="border-l border-line pl-4">
            <p className="flex items-center gap-2 text-lg font-black text-ink">
              <Icon name="bookmark" size={18} /> Saved library
            </p>
            <p className="text-sm font-semibold text-muted">
              {items.length} saved {items.length === 1 ? "item" : "items"}
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
              <Icon name="bookmark" size={28} className="text-line" />
              Nothing saved yet. Tap <span className="font-bold text-ink">Save</span> on any trend to keep it here.
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map((item) => (
                <div key={item.id} className="relative">
                  <TrendMosaicCard item={item} onOpen={onOpen} layout="grid" displayStats={displayStats} />
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    className="absolute right-2 top-2 z-10 rounded-full bg-white/95 p-1.5 text-ink shadow-md transition hover:bg-white hover:text-danger"
                    aria-label="Remove from saved"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Recreation = {
  status: "pending" | "complete" | "error";
  summary: string;
  plan: string;
  provider: string | null;
};

// Renders numbered plan text with light emphasis on step numbers.
function PlanText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink">
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const m = trimmed.match(/^(\d+)[.)]\s*(.*)$/);
        if (m) {
          return (
            <p key={i} className="flex gap-2">
              <span className="font-black text-primary-deep">{m[1]}.</span>
              <span>{m[2]}</span>
            </p>
          );
        }
        return <p key={i}>{trimmed}</p>;
      })}
    </div>
  );
}

// "Summarize & plan to recreate" — calls the free-model chain via Convex, caches
// the result globally (first click generates, everyone after reuses), and shows
// it in a collapsible panel. Polls while a generation is in flight.
function AiRecreatePanel({ item }: { item: TrendItem }) {
  const [rec, setRec] = useState<Recreation | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const pollRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const contentKey = item.id;
  const url = `/api/tools/trends/recreate?key=${encodeURIComponent(contentKey)}`;

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPoll = useCallback(() => {
    setLoading(true);
    stopPoll();
    let attempts = 0;
    pollRef.current = window.setInterval(async () => {
      attempts += 1;
      try {
        const data = await fetch(url).then((r) => r.json());
        if (data.recreation && data.recreation.status !== "pending") {
          if (!cancelledRef.current) {
            setRec(data.recreation);
            setLoading(false);
            setOpen(true);
          }
          stopPoll();
          return;
        }
      } catch {
        /* keep polling */
      }
      if (attempts >= 24) {
        if (!cancelledRef.current) setLoading(false);
        stopPoll();
      }
    }, 1500);
  }, [url, stopPoll]);

  useEffect(() => {
    cancelledRef.current = false;
    setRec(null);
    setLoading(false);
    setOpen(false);
    stopPoll();
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelledRef.current) return;
        setRec(data.recreation ?? null);
        if (data.recreation?.status === "complete") setOpen(true);
        if (data.recreation?.status === "pending") startPoll();
      })
      .catch(() => {});
    return () => {
      cancelledRef.current = true;
      stopPoll();
    };
  }, [url, startPoll, stopPoll]);

  async function generate() {
    setLoading(true);
    setOpen(true);
    try {
      await fetch("/api/tools/trends/recreate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentKey,
          title: item.title,
          platform: platformLabel(item.platform),
          format: contentTypeLabel(item).toLowerCase(),
          caption: item.caption,
          stats: `${item.stats.views} views · ${item.stats.likes} likes · ${item.stats.comments} comments`,
          sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
        }),
      });
      startPoll();
    } catch {
      setLoading(false);
    }
  }

  const complete = rec?.status === "complete";
  const errored = rec?.status === "error";

  // Not yet generated → the call-to-action button.
  if (!complete && !loading && !errored) {
    return (
      <button type="button" onClick={generate} className="btn-primary w-full justify-center">
        <Icon name="sparkles" size={16} /> Summarize &amp; plan to recreate
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/25 bg-primary-soft/40">
      <button
        type="button"
        onClick={() => complete && setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-black text-primary-deep"
      >
        <Icon name="sparkles" size={16} />
        <span className="flex-1">AI summary &amp; recreation plan</span>
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/50 border-t-transparent" />
        ) : complete ? (
          <Icon name={open ? "chevronUp" : "chevronDown"} size={16} />
        ) : null}
      </button>

      {loading && (
        <p className="px-4 pb-4 text-sm font-semibold text-primary-deep/80">Reading the post and drafting a plan…</p>
      )}

      {errored && !loading && (
        <div className="px-4 pb-4">
          <p className="text-sm text-danger">{rec?.plan || "Something went wrong."}</p>
          <button type="button" onClick={generate} className="btn-subtle mt-2">
            Try again
          </button>
        </div>
      )}

      {complete && open && (
        <div className="space-y-4 border-t border-primary/20 bg-white/70 px-4 py-4">
          {rec?.summary && (
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted">Summary</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{rec.summary}</p>
            </div>
          )}
          {rec?.plan && (
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted">Plan to recreate</p>
              <div className="mt-1.5">
                <PlanText text={rec.plan} />
              </div>
            </div>
          )}
          {rec?.provider && (
            <p className="text-[11px] font-semibold text-muted/70">Generated by {rec.provider}</p>
          )}
        </div>
      )}
    </div>
  );
}

function TrendDetail({
  items,
  selected,
  query,
  saved,
  onToggleSave,
  onSelect,
  onClose,
}: {
  items: TrendItem[];
  selected: TrendItem;
  query: string;
  saved: boolean;
  onToggleSave: () => void;
  onSelect: (item: TrendItem) => void;
  onClose: () => void;
}) {
  const selectedThumbRef = useRef<HTMLButtonElement | null>(null);
  const hasPositionedRailRef = useRef(false);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selected.id),
  );
  const previous = items[(selectedIndex - 1 + items.length) % items.length];
  const next = items[(selectedIndex + 1) % items.length];

  useEffect(() => {
    if (hasPositionedRailRef.current) return;
    selectedThumbRef.current?.scrollIntoView({ block: "center" });
    hasPositionedRailRef.current = true;
  }, [selected.id]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 top-14 z-[100] bg-white/95 backdrop-blur-sm lg:left-[var(--pt-sidebar-width,232px)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[290px_minmax(0,1fr)_360px] 2xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-line bg-white p-4 lg:flex">
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input className="input h-11 !pl-9 text-sm" value={query} readOnly placeholder="Search..." />
            </div>
            <button type="button" onClick={onClose} className="btn-subtle !h-11 !w-11 !p-0" aria-label="Close">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="mt-4 flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-y-auto overscroll-contain pr-1">
            {items.map((item) => (
              <button
                key={item.id}
                ref={item.id === selected.id ? selectedThumbRef : null}
                type="button"
                onClick={() => onSelect(item)}
                className={`w-[calc(50%-0.375rem)] overflow-hidden rounded-xl border bg-white text-left transition ${
                  item.id === selected.id
                    ? "border-primary shadow-[0_0_0_2px_rgba(24,177,136,0.18)]"
                    : "border-line hover:border-primary"
                }`}
              >
                <RailPreview item={item} />
              </button>
            ))}
          </div>
        </aside>

        <main className="relative flex min-h-0 overflow-hidden items-center justify-center bg-[#eef3f7] p-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-full bg-white p-3 text-muted shadow-md lg:hidden"
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => onSelect(previous)}
                className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/95 p-3 text-ink shadow-md md:block"
                aria-label="Previous trend"
              >
                <Icon name="chevronLeft" size={20} />
              </button>
              <button
                type="button"
                onClick={() => onSelect(next)}
                className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/95 p-3 text-ink shadow-md md:block"
                aria-label="Next trend"
              >
                <Icon name="chevronRight" size={20} />
              </button>
            </>
          )}
          {!selected.videoId && !selected.thumbnail ? (
            <div className="relative flex max-h-[80vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
              <div className="absolute left-4 top-4 z-10">
                <FormatBadge item={selected} />
              </div>
              <span className="pointer-events-none absolute right-5 top-2 font-serif text-6xl leading-none text-primary/15">
                ”
              </span>
              <div className="overflow-y-auto px-8 pb-8 pt-16">
                <p className="whitespace-pre-wrap text-xl font-semibold leading-relaxed text-ink">{selected.caption}</p>
              </div>
            </div>
          ) : (
            <div
              className={`relative overflow-hidden rounded-2xl bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] ${detailWidthClass(
                selected.aspect,
              )} ${aspectClass(selected.aspect)}`}
            >
              <div className="absolute left-4 top-4 z-10">
                <FormatBadge item={selected} />
              </div>
              {selected.videoId ? (
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube.com/embed/${selected.videoId}?autoplay=1&rel=0`}
                  title={selected.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <ThumbnailArt item={selected} className="object-contain" />
              )}
            </div>
          )}
        </main>

        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-line bg-white">
          {/* Platform banner — clear source-of-origin with its logo */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <SourceBadge item={selected} />
            <a
              href={resolveSourceUrl(selected, query)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-primary-deep"
            >
              View Original Post
              <Icon name="external" size={16} />
            </a>
          </div>

          <div className="flex items-center gap-3 border-b border-line p-5">
            {selected.authorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- external avatar URL
              <img
                src={selected.authorAvatar}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-line"
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-deep text-sm font-black text-white">
                {selected.creator.replace(/^@/, "")[0]?.toUpperCase() ?? "T"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black">{selected.creator}</p>
              <p className="mt-0.5 text-xs font-semibold text-muted">
                {selected.postedAt ?? "Live source"} · {selected.followers ?? platformLabel(selected.platform)}
              </p>
            </div>
          </div>

          <div className="border-b border-line p-5">
            <div className="flex flex-wrap gap-2 text-xs font-extrabold">
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-primary-deep">
                {contentTypeLabel(selected)}
              </span>
              <span className="rounded-full bg-page px-2.5 py-1 text-muted">{selected.category}</span>
              {(selected.slides ?? 1) > 1 && (
                <span className="rounded-full bg-page px-2.5 py-1 text-muted">{selected.slides} slides</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-b border-line p-5">
            <DetailStat icon="eye" label="Views" value={selected.stats.views} />
            <DetailStat icon="heart" label="Likes" value={selected.stats.likes} />
            <DetailStat icon="comment" label="Comments" value={selected.stats.comments} />
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3 text-sm font-bold text-muted">
              <p className="flex items-center gap-2">
                <Icon name="share" size={15} /> {selected.stats.shares} shares
              </p>
              <p className="flex items-center gap-2">
                <Icon name="bookmark" size={15} /> {selected.stats.saves ?? "—"} saves
              </p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted">Caption / why it matters</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{selected.caption}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(selected.tags.length ? selected.tags : [selected.platform]).map((tag) => (
                  <span key={tag} className="rounded-full bg-page px-2 py-1 text-xs font-bold text-muted">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <AiRecreatePanel item={selected} />
          </div>

          <div className="mt-auto shrink-0 border-t border-line p-4">
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved}
              className={`w-full justify-center ${saved ? "btn-subtle" : "btn-primary"}`}
            >
              <Icon name="bookmark" size={16} className={saved ? "fill-current" : ""} />
              {saved ? "Saved" : "Save to library"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SortDropdown({
  value,
  onChange,
}: {
  value: SortId;
  onChange: (value: SortId) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = SORTS.find((sort) => sort.id === value) ?? SORTS[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-extrabold text-ink shadow-sm transition hover:border-primary"
      >
        <Icon name="list" size={17} className="text-muted" />
        {selected.label}
        <Icon name="chevronDown" size={15} className="text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-64 overflow-hidden rounded-xl border border-line bg-white py-2 shadow-[0_18px_35px_rgba(15,23,42,0.16)]">
          {SORTS.map((sort) => (
            <button
              key={sort.id}
              type="button"
              onClick={() => {
                onChange(sort.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold transition ${
                sort.id === value ? "bg-page text-ink" : "text-ink hover:bg-page"
              }`}
            >
              <Icon name={sort.icon} size={17} className="text-muted" />
              <span className="flex-1">{sort.label}</span>
              {sort.id === value && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatorChip({
  creator,
  active,
  onClick,
}: {
  creator: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition ${
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-white text-muted hover:border-primary hover:text-ink"
      }`}
    >
      {creator}
      {active && <Icon name="x" size={14} />}
    </button>
  );
}

function FilterPanel({
  open,
  categories,
  selectedCategories,
  onToggleCategory,
  creators,
  selectedCreators,
  onToggleCreator,
  recentCreators,
  displayStats,
  onToggleDisplayStat,
  ytRegion,
  onYtRegionChange,
  ytHideKids,
  onYtHideKidsChange,
  onReset,
}: {
  open: boolean;
  categories: string[];
  selectedCategories: string[];
  onToggleCategory: (value: string) => void;
  creators: string[];
  selectedCreators: string[];
  onToggleCreator: (value: string) => void;
  recentCreators: string[];
  displayStats: DisplayStat[];
  onToggleDisplayStat: (value: DisplayStat) => void;
  ytRegion: string;
  onYtRegionChange: (value: string) => void;
  ytHideKids: boolean;
  onYtHideKidsChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const [creatorQuery, setCreatorQuery] = useState("");
  const [showAllCreators, setShowAllCreators] = useState(false);

  const query = creatorQuery.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query
        ? creators.filter((c) => !selectedCreators.includes(c) && c.toLowerCase().includes(query))
        : [],
    [creators, query, selectedCreators],
  );
  const recentAvailable = useMemo(
    () => recentCreators.filter((c) => creators.includes(c) && !selectedCreators.includes(c)),
    [recentCreators, creators, selectedCreators],
  );

  if (!open) return null;

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_10px_24px_rgba(6,63,59,0.1)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">Refine</p>
        <button type="button" onClick={onReset} className="text-sm font-bold text-primary-deep hover:underline">
          Reset
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Display stats</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DISPLAY_STATS.map((stat) => {
            const active = displayStats.includes(stat.id);
            return (
              <button
                key={stat.id}
                type="button"
                onClick={() => onToggleDisplayStat(stat.id)}
                className={`inline-flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-extrabold transition ${
                  active
                    ? "border-primary bg-primary-soft text-primary-deep"
                    : "border-line bg-white text-muted hover:border-primary hover:text-ink"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon name={stat.icon} size={16} />
                  {stat.label}
                </span>
                {active && <Icon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-muted">
          <PlatformIcon id="youtube" size={14} /> YouTube options
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-bold text-ink">
            <span className="text-muted">Region</span>
            <select
              className="input !w-auto !py-1.5 font-bold"
              value={ytRegion}
              onChange={(e) => onYtRegionChange(e.target.value)}
            >
              {YOUTUBE_REGIONS.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => onYtHideKidsChange(!ytHideKids)}
            aria-pressed={ytHideKids}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold transition ${
              ytHideKids
                ? "border-primary bg-primary-soft text-primary-deep"
                : "border-line bg-white text-muted hover:border-primary hover:text-ink"
            }`}
          >
            <Icon name={ytHideKids ? "check" : "x"} size={15} />
            Hide kids content
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Category</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((category) => {
              const active = selectedCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onToggleCategory(category)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-white text-muted hover:border-primary hover:text-ink"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Creator / source</p>

          <div className="relative mt-2">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="input !pl-9"
              placeholder="Search creators or sources…"
              value={creatorQuery}
              onChange={(e) => setCreatorQuery(e.target.value)}
            />
          </div>

          {selectedCreators.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {selectedCreators.map((creator) => (
                <CreatorChip key={creator} creator={creator} active onClick={() => onToggleCreator(creator)} />
              ))}
            </div>
          )}

          {query ? (
            <div className="mt-2.5">
              {matches.length === 0 ? (
                <p className="text-sm text-muted">No creators match “{creatorQuery.trim()}”.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {matches.slice(0, 12).map((creator) => (
                    <CreatorChip
                      key={creator}
                      creator={creator}
                      active={false}
                      onClick={() => {
                        onToggleCreator(creator);
                        setCreatorQuery("");
                      }}
                    />
                  ))}
                  {matches.length > 12 && (
                    <span className="self-center text-xs font-bold text-muted">+{matches.length - 12} more</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {recentAvailable.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted/70">Recent</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {recentAvailable.slice(0, 8).map((creator) => (
                      <CreatorChip
                        key={creator}
                        creator={creator}
                        active={false}
                        onClick={() => onToggleCreator(creator)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowAllCreators((v) => !v)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary-deep hover:underline"
              >
                {showAllCreators ? "Hide all" : `See all ${creators.length}`}
                <Icon name={showAllCreators ? "chevronUp" : "chevronDown"} size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {showAllCreators && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">All creators / sources</p>
            <button
              type="button"
              onClick={() => setShowAllCreators(false)}
              className="inline-flex items-center gap-1 text-sm font-bold text-primary-deep hover:underline"
            >
              <Icon name="chevronUp" size={15} /> Hide
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {creators.map((creator) => (
              <CreatorChip
                key={creator}
                creator={creator}
                active={selectedCreators.includes(creator)}
                onClick={() => onToggleCreator(creator)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TrendFinder() {
  const [topic, setTopic] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformFilter[]>([]);
  const [aspectFilter, setAspectFilter] = useState<"all" | TrendAspect>("all");
  // Default keeps the API's trending/popular order (recently-added == fetch order).
  const [sort, setSort] = useState<SortId>("recently-added");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [contentType, setContentType] = useState<ContentTypeFilter>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [recentCreators, setRecentCreators] = useState<string[]>([]);
  const [displayStats, setDisplayStats] = useState<DisplayStat[]>(["views", "likes", "comments"]);
  const [ytRegion, setYtRegion] = useState("US");
  const [ytHideKids, setYtHideKids] = useState(false);
  const [liveItems, setLiveItems] = useState<TrendItem[]>([]);
  const [isLoadingLiveItems, setIsLoadingLiveItems] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [platformStatus, setPlatformStatus] = useState<Record<ApiBackedPlatform, PlatformStatus>>({
    youtube: "idle",
    bluesky: "idle",
    mastodon: "idle",
  });
  const [platformMessage, setPlatformMessage] = useState<Partial<Record<ApiBackedPlatform, string>>>({});
  const [selected, setSelected] = useState<TrendItem | null>(null);
  const [detailScope, setDetailScope] = useState<"grid" | "saved">("grid");
  const [savedItems, setSavedItems] = useState<TrendItem[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const pageScrollYRef = useRef(0);
  const clean = topic.trim().replace(/^#/, "");
  const shouldShowAllPlatforms = selectedPlatforms.length === 0;
  // Source tokens sent to the API (includes the "youtube-shorts" variant). "All"
  // defaults to the regular live sources — Shorts is opt-in via its own chip. The
  // active content type further narrows to sources that can surface it (e.g. Text
  // → Bluesky/Mastodon, Video → YouTube).
  const requestedApiSources = useMemo<ApiSource[]>(
    () => {
      const base: ApiSource[] = shouldShowAllPlatforms
        ? ["youtube", "bluesky", "mastodon"]
        : API_SOURCES.filter((source) => selectedPlatforms.includes(source));
      return base.filter((source) => platformSupportsType(source, contentType));
    },
    [selectedPlatforms, shouldShowAllPlatforms, contentType],
  );
  // Real platforms behind those sources (youtube-shorts → youtube), for status + timeouts.
  const requestedApiPlatforms = useMemo<ApiBackedPlatform[]>(
    () =>
      Array.from(
        new Set(requestedApiSources.map((source) => (source === "youtube-shorts" ? "youtube" : source))),
      ) as ApiBackedPlatform[],
    [requestedApiSources],
  );
  const shouldLoadLiveItems = requestedApiSources.length > 0;
  const useMosaicLayout = aspectFilter === "all";
  const isDetailOpen = Boolean(selected) || libraryOpen;

  useEffect(() => {
    setPortalReady(true);
    try {
      const raw = localStorage.getItem("pt_trend_recent_creators");
      if (raw) setRecentCreators(JSON.parse(raw));
      const savedRaw = localStorage.getItem("pt_trend_saved");
      if (savedRaw) setSavedItems(JSON.parse(savedRaw));
    } catch {}
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // When the content type changes, drop any selected source that can't surface it
  // (falls back to "All" of the compatible sources if the selection empties).
  useEffect(() => {
    if (contentType === "all") return;
    setSelectedPlatforms((current) => {
      const next = current.filter((platform) => platformSupportsType(platform, contentType));
      return next.length === current.length ? current : next;
    });
  }, [contentType]);

  useEffect(() => {
    if (!isDetailOpen || typeof window === "undefined") return;

    const scrollY = pageScrollYRef.current;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    };
  }, [isDetailOpen]);

  useEffect(() => {
    if (!shouldLoadLiveItems) {
      setLiveItems([]);
      setNextCursor(null);
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const debounce = window.setTimeout(async () => {
      setIsLoadingLiveItems(true);
      setPlatformStatus((current) => {
        const next = { ...current };
        for (const platform of requestedApiPlatforms) next[platform] = "loading";
        return next;
      });
      setPlatformMessage((current) => {
        const next = { ...current };
        for (const platform of requestedApiPlatforms) delete next[platform];
        return next;
      });

      const timeoutTimer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, LIVE_FETCH_TIMEOUT_MS);

      try {
        const params = new URLSearchParams();
        if (clean) params.set("q", clean);
        params.set("platforms", requestedApiSources.join(","));
        if (ytRegion && ytRegion !== "US") params.set("region", ytRegion);
        if (ytHideKids) params.set("hideKids", "1");
        const response = await fetch(`/api/tools/trends?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          items?: TrendItem[];
          nextCursor?: string | null;
          errors?: { platform: ApiBackedPlatform; reason: string }[];
        };
        if (!controller.signal.aborted) {
          setLiveItems((data.items ?? []).map(normalizeLiveItem));
          setNextCursor(data.nextCursor ?? null);
          const failed = new Map((data.errors ?? []).map((e) => [e.platform, e.reason]));
          setPlatformStatus((current) => {
            const next = { ...current };
            for (const platform of requestedApiPlatforms) {
              next[platform] = failed.has(platform) ? "error" : "ready";
            }
            return next;
          });
          setPlatformMessage((current) => {
            const next = { ...current };
            for (const platform of requestedApiPlatforms) {
              if (failed.has(platform)) next[platform] = failed.get(platform)!;
            }
            return next;
          });
        }
      } catch {
        // An abort that isn't our own timeout means a newer request superseded
        // this one (query changed) — the next effect run owns the status update.
        if (controller.signal.aborted && !timedOut) {
          return;
        }
        if (!controller.signal.aborted) {
          setLiveItems([]);
          setNextCursor(null);
        }
        setPlatformStatus((current) => {
          const next = { ...current };
          for (const platform of requestedApiPlatforms) next[platform] = timedOut ? "timeout" : "error";
          return next;
        });
        setPlatformMessage((current) => {
          const next = { ...current };
          for (const platform of requestedApiPlatforms) {
            next[platform] = timedOut
              ? `${platformLabel(platform)} took longer than ${LIVE_FETCH_TIMEOUT_MS / 1000}s to respond. Try again shortly.`
              : `Couldn't load live ${platformLabel(platform)} results.`;
          }
          return next;
        });
      } finally {
        window.clearTimeout(timeoutTimer);
        if (!controller.signal.aborted) {
          setIsLoadingLiveItems(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(debounce);
    };
  }, [clean, requestedApiSources, shouldLoadLiveItems, ytRegion, ytHideKids]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (clean) params.set("q", clean);
      params.set("platforms", requestedApiSources.join(","));
      if (ytRegion && ytRegion !== "US") params.set("region", ytRegion);
      if (ytHideKids) params.set("hideKids", "1");
      params.set("cursor", nextCursor);
      const response = await fetch(`/api/tools/trends?${params.toString()}`);
      const data = (await response.json()) as { items?: TrendItem[]; nextCursor?: string | null };
      const incoming = (data.items ?? []).map(normalizeLiveItem);
      setLiveItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...incoming.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setNextCursor(null); // stop paginating on error rather than looping
    } finally {
      setIsLoadingMore(false);
    }
  }, [clean, requestedApiSources, nextCursor, isLoadingMore, ytRegion, ytHideKids]);

  // Live API results only (YouTube, Bluesky, Mastodon). No static/mock fallback:
  // platforms without a live source simply return nothing rather than placeholders.
  const allItems = liveItems;

  const categories = useMemo(() => Array.from(new Set(allItems.map((item) => item.category))).sort(), [allItems]);
  const creators = useMemo(() => Array.from(new Set(allItems.map((item) => item.creator))).sort(), [allItems]);

  const filtered = useMemo(() => {
    const q = clean.toLowerCase();
    const listed = allItems.filter((item) => {
      if (
        !(
        (shouldShowAllPlatforms || itemMatchesSources(item, selectedPlatforms)) &&
        (aspectFilter === "all" || item.aspect === aspectFilter)
        )
      ) {
        return false;
      }

      if (contentType === "videos" && item.format !== "video") return false;
      // Text = social posts with no media; Photo = anything with a real image
      // thumbnail that isn't a video.
      if (contentType === "text" && (item.format !== "source" || item.thumbnail)) return false;
      if (contentType === "photos" && (item.format === "video" || !item.thumbnail)) return false;
      if (selectedCategories.length > 0 && !selectedCategories.includes(item.category)) return false;
      if (selectedCreators.length > 0 && !selectedCreators.includes(item.creator)) return false;
      if (!q) return true;
      return [item.title, item.creator, item.caption, item.category, item.source, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const addedIndex = new Map(allItems.map((item, index) => [item.id, index]));
    const idx = (item: TrendItem) => addedIndex.get(item.id) ?? 0;
    return [...listed].sort((a, b) => {
      if (sort === "recently-added") return idx(a) - idx(b);
      if (sort === "oldest-added") return idx(b) - idx(a);
      if (sort === "latest-posted") return postedTime(b) - postedTime(a);
      if (sort === "oldest-posted") return postedTime(a) - postedTime(b);
      if (sort === "views") return parseMetric(b.stats.views) - parseMetric(a.stats.views);
      if (sort === "likes") return parseMetric(b.stats.likes) - parseMetric(a.stats.likes);
      if (sort === "comments") return parseMetric(b.stats.comments) - parseMetric(a.stats.comments);
      return (b.slides ?? 1) - (a.slides ?? 1);
    });
  }, [
    allItems,
    aspectFilter,
    clean,
    contentType,
    selectedCategories,
    selectedCreators,
    selectedPlatforms,
    shouldShowAllPlatforms,
    sort,
  ]);

  // Detail navigation walks the list it was opened from (grid results or saved).
  const detailItems = detailScope === "saved" ? savedItems : filtered;
  const activeSelected = selected ? detailItems.find((item) => item.id === selected.id) ?? selected : null;
  const isSaved = (id: string) => savedItems.some((item) => item.id === id);
  function toggleSave(item: TrendItem) {
    setSavedItems((current) => {
      const next = current.some((s) => s.id === item.id)
        ? current.filter((s) => s.id !== item.id)
        : [item, ...current];
      try {
        localStorage.setItem("pt_trend_saved", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const showLoadingSkeletons = isLoadingLiveItems && liveItems.length === 0 && requestedApiPlatforms.length > 0;
  const refineCount = selectedCategories.length + selectedCreators.length;

  // Pure server pagination: render everything fetched so far and pull exactly one
  // more YouTube page each time the user reaches the bottom (after a short delay).
  const hasMore = Boolean(nextCursor);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          // Left the bottom before the delay elapsed — cancel the pending load.
          if (loadMoreTimerRef.current) {
            window.clearTimeout(loadMoreTimerRef.current);
            loadMoreTimerRef.current = null;
          }
          return;
        }
        // Single-flight: ignore if a load is already running or scheduled.
        if (isLoadingMore || loadMoreTimerRef.current) return;
        loadMoreTimerRef.current = window.setTimeout(() => {
          loadMoreTimerRef.current = null;
          loadMore();
        }, 1000);
      },
      // Trigger at the actual bottom (small buffer), not 600px early — that eager
      // margin plus re-observation was firing repeatedly and loading many pages.
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (loadMoreTimerRef.current) {
        window.clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
    };
  }, [nextCursor, isLoadingMore, loadMore]);

  function togglePlatform(next: "all" | PlatformFilter) {
    if (next === "all") {
      setSelectedPlatforms([]);
      return;
    }
    setSelectedPlatforms((current) =>
      current.includes(next) ? current.filter((item) => item !== next) : [...current, next],
    );
  }

  function isPlatformActive(id: "all" | PlatformFilter) {
    return (id === "all" && shouldShowAllPlatforms) || (id !== "all" && selectedPlatforms.includes(id));
  }

  function apiStatusFor(id: "all" | PlatformFilter): PlatformStatus | undefined {
    const key = id === "youtube-shorts" ? "youtube" : id;
    return (API_BACKED_PLATFORMS as string[]).includes(key) ? platformStatus[key as ApiBackedPlatform] : undefined;
  }

  function toggleListValue(value: string, setter: (next: string[]) => void, current: string[]) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleCreator(creator: string) {
    const willSelect = !selectedCreators.includes(creator);
    toggleListValue(creator, setSelectedCreators, selectedCreators);
    if (willSelect) {
      setRecentCreators((current) => {
        const next = [creator, ...current.filter((item) => item !== creator)].slice(0, 12);
        try {
          localStorage.setItem("pt_trend_recent_creators", JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }

  function toggleDisplayStat(value: DisplayStat) {
    setDisplayStats((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function resetFilters() {
    setContentType("all");
    setSelectedCategories([]);
    setSelectedCreators([]);
    setDisplayStats(["views", "likes", "comments"]);
    setYtRegion("US");
    setYtHideKids(false);
  }

  function openTrend(item: TrendItem, scope: "grid" | "saved" = "grid") {
    if (!selected && typeof window !== "undefined") {
      pageScrollYRef.current = window.scrollY;
    }
    setDetailScope(scope);
    setSelected(item);
  }

  function closeTrend() {
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {savedItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <Icon name="bookmark" size={13} className="fill-current" />
            </span>
            <p className="text-sm font-black text-ink">Saved library</p>
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-extrabold text-primary-deep">
              {savedItems.length}
            </span>
            <div className="h-px flex-1 bg-line" />
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary-deep transition hover:border-primary hover:bg-primary-soft"
            >
              See all
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {savedItems.slice(0, 14).map((item) => (
              <SavedCard key={item.id} item={item} onOpen={() => openTrend(item, "saved")} />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_18px_rgba(6,63,59,0.08)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="input !pl-9"
              placeholder="Search topic, hook, hashtag, or niche"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <SortDropdown value={sort} onChange={setSort} />
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className={`inline-flex h-12 items-center gap-2 rounded-xl border px-4 text-sm font-extrabold shadow-sm transition ${
                filtersOpen
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-white text-ink hover:border-primary"
              }`}
            >
              <Icon name="filter" size={17} />
              Refine
              {refineCount > 0 && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-black ${
                    filtersOpen ? "bg-white text-primary-deep" : "bg-primary text-white"
                  }`}
                >
                  {refineCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {PLATFORMS.filter((p) => p.id === "all" || platformSupportsType(p.id, contentType)).map((p) => {
            const active = isPlatformActive(p.id);
            const status = apiStatusFor(p.id);
            const statusKey = p.id === "youtube-shorts" ? "youtube" : p.id;
            const issueMessage =
              status === "timeout" || status === "error"
                ? platformMessage[statusKey as ApiBackedPlatform]
                : undefined;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (!p.disabled) togglePlatform(p.id);
                }}
                disabled={p.disabled}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                  p.disabled
                    ? "cursor-not-allowed border-line bg-page text-muted opacity-70"
                    : active
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-white text-ink hover:border-primary"
                }`}
              >
                {p.iconId ? <PlatformIcon id={p.iconId} size={15} colored={!active || p.disabled} /> : null}
                {p.label}
                {issueMessage && (
                  <span title={issueMessage} className={active ? "text-white" : "text-amber-500"}>
                    <Icon name="warningTriangle" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-3">
          <SegmentedControl
            label="Type"
            value={contentType}
            onChange={setContentType}
            options={CONTENT_TYPES.map((type) => ({ id: type.id, label: type.label, icon: type.icon }))}
          />
          <SegmentedControl
            label="Shape"
            value={aspectFilter}
            onChange={setAspectFilter}
            options={ASPECTS.map((aspect) => ({
              id: aspect.id,
              label: aspect.label === "All formats" ? "Mosaic" : aspect.label,
              hint: aspect.id === "all" ? undefined : aspect.ratio,
              renderIcon: () => <AspectIcon aspect={aspect} active={false} />,
            }))}
          />
        </div>
      </div>

      <FilterPanel
        open={filtersOpen}
        categories={categories}
        selectedCategories={selectedCategories}
        onToggleCategory={(category) => toggleListValue(category, setSelectedCategories, selectedCategories)}
        creators={creators}
        selectedCreators={selectedCreators}
        onToggleCreator={toggleCreator}
        recentCreators={recentCreators}
        displayStats={displayStats}
        onToggleDisplayStat={toggleDisplayStat}
        ytRegion={ytRegion}
        onYtRegionChange={setYtRegion}
        ytHideKids={ytHideKids}
        onYtHideKidsChange={setYtHideKids}
        onReset={resetFilters}
      />

      <div className="flex flex-col gap-2 rounded-2xl bg-primary-soft/60 p-4 text-sm text-primary-deep sm:flex-row sm:items-center sm:justify-between">
        <p>
          {isLoadingLiveItems
            ? "Loading live trends…"
            : useMosaicLayout
              ? "All formats uses a packed mosaic."
              : "Aspect filter active — showing a clean same-size grid."}{" "}
          Live trends come from YouTube, Bluesky, and Mastodon free APIs.
        </p>
        <span className="font-extrabold">
          {filtered.length} trend sources{hasMore ? "+" : ""}
        </span>
      </div>

      <div
        className={
          useMosaicLayout
            ? "grid auto-rows-[88px] grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 [grid-auto-flow:dense]"
            : "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        }
      >
        {showLoadingSkeletons &&
          Array.from({ length: 6 }).map((_, i) => (
            <SkeletonMosaicCard key={`skeleton-${i}`} layout={useMosaicLayout ? "mosaic" : "grid"} />
          ))}
        {filtered.map((item) => (
          <TrendMosaicCard
            key={item.id}
            item={item}
            onOpen={openTrend}
            layout={useMosaicLayout ? "mosaic" : "grid"}
            displayStats={displayStats}
          />
        ))}
      </div>

      {hasMore && (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center gap-2.5 py-6 text-sm font-bold text-muted"
        >
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/60 border-t-transparent" />
          Loading more…
        </div>
      )}

      {/* Only YouTube (video/Shorts) paginates — Bluesky/Mastodon never set a
          cursor, so this only fires once a YouTube search has genuinely run dry. */}
      {!hasMore &&
        !isLoadingLiveItems &&
        filtered.length > 0 &&
        requestedApiPlatforms.includes("youtube") && (
          <p className="py-6 text-center text-sm font-semibold text-muted">
            That's every result YouTube's search API has for this query — try a different search or filter for more.
          </p>
        )}

      {!showLoadingSkeletons && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
          {!shouldLoadLiveItems && selectedPlatforms.length > 0
            ? "No live trend data for that source yet — Bluesky and Mastodon are wired first, with YouTube available when configured."
            : "No results. Try a different search, source, or format."}
        </div>
      )}

      {activeSelected &&
        portalReady &&
        createPortal(
          <TrendDetail
            items={detailItems}
            selected={activeSelected}
            query={clean}
            saved={isSaved(activeSelected.id)}
            onToggleSave={() => toggleSave(activeSelected)}
            onSelect={setSelected}
            onClose={closeTrend}
          />,
          document.body,
        )}

      {libraryOpen &&
        portalReady &&
        createPortal(
          <SavedLibrary
            items={savedItems}
            displayStats={displayStats}
            onOpen={(item) => {
              setLibraryOpen(false);
              openTrend(item, "saved");
            }}
            onRemove={toggleSave}
            onClose={() => setLibraryOpen(false)}
          />,
          document.body,
        )}

      {showBackToTop &&
        createPortal(
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed left-1/2 top-20 z-50 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-bold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition hover:shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
            aria-label="Back to top"
          >
            <Icon name="chevronUp" size={16} />
            Back to top
          </button>,
          document.body,
        )}
    </div>
  );
}
