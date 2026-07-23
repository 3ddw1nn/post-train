"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type ToolCardItem = {
  slug: string;
  name: string;
  desc: string;
  icon: string;
  href: string;
};

function isPlainPrimaryClick(
  event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>
) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function MiniCheck({ muted = false }: { muted?: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-4 -rotate-45 border-b-2 border-l-2 ${
        muted ? "border-amber-400" : "border-primary-deep"
      }`}
    />
  );
}

function TrendGraphic() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="grid w-64 max-w-[82%] grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
          <p className="text-xs font-bold text-blue-600">Views</p>
          <p className="mt-1 text-xl font-extrabold">1.2M <span className="text-xs text-emerald-600">+18%</span></p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
          <p className="text-xs font-bold text-pink-500">Likes</p>
          <p className="mt-1 text-xl font-extrabold">84K <span className="text-xs text-emerald-600">+9%</span></p>
        </div>
      </div>
      <div className="flex h-16 items-end gap-2">
        {[26, 38, 30, 54, 38, 80, 45, 64].map((h, i) => (
          <span
            key={i}
            className={`w-8 rounded-t-md ${i === 5 ? "bg-primary-deep" : "bg-primary-soft"}`}
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
}

function GridGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-white p-3 shadow-sm">
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className={`h-10 w-10 rounded-lg ${i % 2 ? "bg-primary-soft" : "bg-page"} ring-1 ring-line`}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-72 max-w-[86%] items-center gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 flex-1 rounded-xl border border-line bg-white p-2 shadow-sm">
            <div className={`h-full rounded-lg ${i === 1 ? "bg-primary-soft" : "bg-page"}`} />
          </div>
        ))}
      </div>
      <div className="absolute bottom-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 w-5 rounded-full ${i === 0 ? "bg-primary-deep" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}

function HandleGraphic({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="w-72 max-w-[86%] rounded-xl border border-line bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold text-muted">@{label}</p>
        <div className="mt-2 h-2 rounded-full bg-primary-soft" />
      </div>
      <div className="grid w-72 max-w-[86%] grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-14 items-center justify-center rounded-xl border border-primary-soft bg-primary-soft/60">
            <MiniCheck muted={i === 2} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CaptionGraphic() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      {["POV: you found the hook", "Save this before posting", "#fyp #creator"].map((line, i) => (
        <div
          key={line}
          className={`w-72 max-w-[86%] rounded-xl border border-line bg-white px-4 py-2 shadow-sm ${
            i === 0 ? "text-primary-deep" : "text-muted"
          }`}
        >
          <p className="truncate text-sm font-bold">{line}</p>
        </div>
      ))}
    </div>
  );
}

function FormatterGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-72 max-w-[86%] rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex gap-2">
          <span className="rounded-lg bg-primary-soft px-3 py-1 text-sm font-extrabold text-primary-deep">B</span>
          <span className="rounded-lg bg-page px-3 py-1 text-sm italic text-primary-deep">I</span>
        </div>
        <div className="mt-4 space-y-2">
          <span className="block h-2 rounded-full bg-primary-soft" />
          <span className="block h-2 w-4/5 rounded-full bg-page" />
          <span className="block h-2 w-2/3 rounded-full bg-page" />
        </div>
      </div>
    </div>
  );
}

function YoutubeTitleGraphic() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="w-72 max-w-[86%] rounded-xl border border-line bg-white p-3 shadow-sm">
        <div className="h-3 w-3/4 rounded-full bg-primary-soft" />
        <p className="mt-2 text-xs font-bold text-primary-deep">68 / 70</p>
      </div>
      <div className="grid w-72 max-w-[86%] grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-10 items-center gap-2 rounded-lg bg-white px-3 shadow-sm ring-1 ring-line">
            <MiniCheck muted={i === 3} />
            <span className="h-2 flex-1 rounded-full bg-page" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TagGraphic() {
  return (
    <div className="flex h-full flex-wrap content-center justify-center gap-2 px-8">
      {["tutorial", "tips", "2026", "guide", "how to", "explained", "best"].map((tag, i) => (
        <span
          key={tag}
          className={`rounded-full px-3 py-1.5 text-sm font-bold ${
            i % 3 === 0 ? "bg-primary-deep text-white" : "bg-white text-primary-deep ring-1 ring-line"
          }`}
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}

function XBlockerGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="grid w-72 max-w-[86%] grid-cols-[1fr_1.4fr] gap-3">
        <div className="space-y-2 rounded-xl border border-line bg-white p-3 shadow-sm opacity-50">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-8 rounded-lg bg-page" />
          ))}
        </div>
        <div className="flex items-center justify-center rounded-xl border border-primary-soft bg-primary-soft/70 p-4 shadow-sm">
          <span className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-primary-deep">
            Timeline hidden
          </span>
        </div>
      </div>
    </div>
  );
}

function CounterGraphic() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex gap-2">
        {["#launch", "#ugc", "#tools"].map((tag) => (
          <span key={tag} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary-deep">
            {tag}
          </span>
        ))}
      </div>
      <div className="grid w-72 max-w-[86%] grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
          <p className="text-xs text-muted">Characters</p>
          <p className="text-xl font-extrabold">186</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
          <p className="text-xs text-muted">Hashtags</p>
          <p className="text-xl font-extrabold">3</p>
        </div>
      </div>
    </div>
  );
}

function GuideGraphic() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-64 max-w-[78%] rounded-2xl border border-line bg-white p-3 shadow-sm">
        <div className="mb-3 h-3 w-1/2 rounded-full bg-primary-deep" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-2 flex items-center gap-3 last:mb-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft">
              <MiniCheck muted={i === 2} />
            </span>
            <span className="h-2 flex-1 rounded-full bg-page" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolGraphic({ slug }: { slug: string }) {
  switch (slug) {
    case "trend-finder":
      return <TrendGraphic />;
    case "instagram-grid-maker":
      return <GridGraphic />;
    case "carousel-splitter":
      return <CarouselGraphic />;
    case "instagram-handle-checker":
      return <HandleGraphic label="creatorname" />;
    case "tiktok-username-checker":
      return <HandleGraphic label="posttrain" />;
    case "tiktok-caption-generator":
      return <CaptionGraphic />;
    case "linkedin-formatter":
      return <FormatterGraphic />;
    case "youtube-title-checker":
      return <YoutubeTitleGraphic />;
    case "youtube-tag-generator":
      return <TagGraphic />;
    case "x-timeline-blocker":
      return <XBlockerGraphic />;
    case "hashtag-counter":
      return <CounterGraphic />;
    default:
      return <GuideGraphic />;
  }
}

export function ToolCardGrid({ tools }: { tools: ToolCardItem[] }) {
  const pathname = usePathname();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  useEffect(() => {
    setPendingSlug(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingSlug) return;
    const timeout = window.setTimeout(() => setPendingSlug(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [pendingSlug]);

  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => {
        const pending = pendingSlug === t.slug;
        return (
          <Link
            key={t.slug}
            href={t.href}
            aria-busy={pending}
            onPointerDown={(event) => {
              if (!isPlainPrimaryClick(event)) return;
              if (t.href === pathname) return;
              setPendingSlug(t.slug);
            }}
            onClick={(event) => {
              if (!isPlainPrimaryClick(event)) return;
              if (t.href === pathname) return;
              setPendingSlug(t.slug);
            }}
            className={`group relative overflow-hidden rounded-2xl border bg-white transition-colors ${
              pending
                ? "border-primary bg-primary-soft/20 shadow-[0_10px_18px_rgba(6,63,59,0.22)]"
                : "border-[rgba(6,63,59,0.14)] shadow-[0_6px_12px_rgba(6,63,59,0.16)] hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_18px_rgba(6,63,59,0.22)]"
            }`}
          >
            <div className="relative h-44 overflow-hidden border-b border-line bg-page">
              <ToolGraphic slug={t.slug} />
              {pending && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-xs font-semibold text-primary-deep">Loading...</span>
                </div>
              )}
            </div>
            <div className="p-5">
              <p className="font-bold">{t.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t.desc}</p>
            </div>
            {pending && (
              <span className="absolute inset-0 rounded-2xl ring-2 ring-primary" aria-hidden />
            )}
          </Link>
        );
      })}
    </div>
  );
}
