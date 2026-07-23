"use client";

// Explore ("viral content library"): a searchable grid of trending posts
// that opens into a split detail view (stats, caption, "Use as Template").
// All filtering/sorting runs client-side over the server-fetched item list
// — cheap at this volume (a few dozen curated posts).
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import type { ExploreItem, ExploreSlide } from "@/lib/explore";

type ExploreItemWithSlides = ExploreItem & { slides: ExploreSlide[] };

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "views", label: "Most viewed" },
  { id: "likes", label: "Most liked" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

function ExploreCard({ item, onOpen }: { item: ExploreItemWithSlides; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-page">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.cover_image_url}
          alt=""
          className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.03]"
        />
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
          1/{item.slide_count}
        </span>
        {item.media_type === "video" && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
            <Icon name="video" size={13} />
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 text-xs font-semibold text-white">
          <span className="flex items-center gap-1">
            <Icon name="eye" size={13} /> {formatCount(item.view_count)}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="heart" size={13} /> {formatCount(item.like_count)}
          </span>
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-bold">{item.category}</p>
      <p className="truncate text-xs text-muted">@{item.creator_handle}</p>
    </button>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-page p-2">
      <p className="flex items-center justify-center gap-1 text-sm font-bold">
        <Icon name={icon} size={13} className="text-muted" /> {formatCount(value)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}

function ExploreDetail({
  items,
  selected,
  onSelect,
  onClose,
}: {
  items: ExploreItemWithSlides[];
  selected: ExploreItemWithSlides;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [slideIdx, setSlideIdx] = useState(0);
  const slides = selected.slides.length ? selected.slides : [{ image_url: selected.cover_image_url, text: "" }];
  const slide = slides[Math.min(slideIdx, slides.length - 1)];

  return (
    <div className="mt-5">
      <button type="button" onClick={onClose} className="text-sm text-muted hover:underline">
        ← Back to grid
      </button>
      <div className="mt-3 grid gap-4 lg:grid-cols-[220px_1fr_320px]">
        <div className="hidden max-h-[70vh] flex-col gap-1 overflow-y-auto lg:flex">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                onSelect(it.id);
                setSlideIdx(0);
              }}
              className={`flex items-center gap-2 rounded-lg p-1.5 text-left ${
                it.id === selected.id ? "bg-primary-soft" : "hover:bg-page"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.cover_image_url} className="h-12 w-9 shrink-0 rounded object-cover" alt="" />
              <span className="min-w-0 flex-1 truncate text-xs">{it.caption}</span>
            </button>
          ))}
        </div>

        <div className="card flex flex-col items-center p-4">
          <p className="w-full text-center text-xs font-semibold text-muted">
            {slideIdx + 1} / {slides.length}
          </p>
          <div className="relative mt-2 aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.image_url} className="h-full w-full object-cover" alt="" />
            {slide.text && (
              <p className="absolute inset-x-4 top-8 text-center text-lg font-extrabold leading-tight text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
                {slide.text}
              </p>
            )}
            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
                  disabled={slideIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white disabled:opacity-30"
                >
                  <Icon name="chevronLeft" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setSlideIdx((i) => Math.min(slides.length - 1, i + 1))}
                  disabled={slideIdx === slides.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white disabled:opacity-30"
                >
                  <Icon name="chevronRight" size={16} />
                </button>
              </>
            )}
          </div>
          {slides.length > 1 && (
            <div className="mt-2 flex gap-1">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${i === slideIdx ? "bg-primary" : "bg-line"}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-deep">
              {selected.creator_handle[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">@{selected.creator_handle}</p>
              <p className="text-xs text-muted">
                {new Date(selected.posted_at).toLocaleDateString()} · {selected.slide_count} slide
                {selected.slide_count === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <p className="mt-2 flex flex-wrap gap-1.5">
            <span className="pill bg-page text-muted capitalize">{selected.platform}</span>
            <span className="pill bg-primary-soft text-primary-deep">{selected.category}</span>
          </p>

          <div className="mt-4 grid grid-cols-3 gap-1.5">
            <Stat icon="eye" label="Views" value={selected.view_count} />
            <Stat icon="heart" label="Likes" value={selected.like_count} />
            <Stat icon="comment" label="Comments" value={selected.comment_count} />
            <Stat icon="share" label="Shares" value={selected.share_count} />
            <Stat icon="bookmark" label="Saves" value={selected.save_count} />
          </div>

          <p className="mt-4 text-xs font-bold uppercase text-muted">Caption</p>
          <p className="mt-1 text-sm">{selected.caption}</p>
          {selected.hashtags.length > 0 && (
            <p className="mt-1 text-sm text-primary-deep">
              {selected.hashtags.map((h) => `#${h}`).join(" ")}
            </p>
          )}

          <p className="mt-4 text-xs font-bold uppercase text-muted">Monetization</p>
          <p className="mt-1 text-sm text-muted">
            {selected.is_monetized ? "Monetization signals detected" : "No monetization signals detected"}
          </p>

          <Link
            href={`/dashboard/content-studio/slideshow?from=${selected.id}`}
            className="btn-primary mt-4 w-full justify-center"
          >
            <Icon name="sparkles" size={15} /> Use as Template
          </Link>
          {selected.source_url === "#" ? (
            <span
              className="btn-subtle mt-2 w-full cursor-not-allowed justify-center opacity-60"
              title="Sample placeholder — no original post"
            >
              <Icon name="external" size={14} /> View Original Post
            </span>
          ) : (
            <a
              href={selected.source_url}
              target="_blank"
              rel="noreferrer"
              className="btn-subtle mt-2 w-full justify-center"
            >
              <Icon name="external" size={14} /> View Original Post
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExploreBrowser({ items }: { items: ExploreItemWithSlides[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortId>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((i) => i.category)))],
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (!q) return true;
      return (
        i.caption.toLowerCase().includes(q) ||
        i.creator_handle.toLowerCase().includes(q) ||
        i.hashtags.some((h) => h.toLowerCase().includes(q))
      );
    });
    return [...list].sort((a, b) => {
      if (sort === "views") return b.view_count - a.view_count;
      if (sort === "likes") return b.like_count - a.like_count;
      return b.posted_at.localeCompare(a.posted_at);
    });
  }, [items, query, category, sort]);

  const selected = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null;

  return (
    <div className="fade-up">
      <div className="card p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Explore</h1>
            <p className="mt-1 text-sm text-muted">
              Browse trending posts for inspiration, then use one as a starting point for your own.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="input w-full !pl-9"
              placeholder="Search captions, creators, hashtags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-48"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All categories" : c}
              </option>
            ))}
          </select>
          <select
            className="input sm:w-40"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {selected ? (
          <ExploreDetail
            items={filtered}
            selected={selected}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((item) => (
              <ExploreCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-muted">
                No posts match your filters.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
