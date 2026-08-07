"use client";

// The Analytics dashboard. All slicing happens client-side against one payload
// fetched on the server, so timeframe/metric/platform switches are instant and
// can animate — a server round-trip per filter click made the old version feel
// like a page, not a dashboard.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { platform as platformOf, ANALYTICS_PLATFORMS } from "@/lib/platforms";
import {
  ACCENT,
  BarChart,
  ChartEmpty,
  Donut,
  Heatmap,
  Legend,
  LineChart,
  Meter,
  SERIES,
  StackedBars,
  StatTile,
  TableView,
  compact,
  full,
  type Series as ChartSeries,
} from "@/components/charts";
import { bucketByDay, engagementRate, timingGrid, type Bucket as ShapeBucket } from "@/lib/analytics-shape";
import { sampleAnalytics } from "@/lib/analytics-sample";
import { SyncButton } from "./sync-button";

export type Row = {
  id: string;
  platform: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  cover_image_url: string | null;
  share_url: string | null;
  video_description: string | null;
  duration: number | null;
  platform_created_at: string | null;
  last_synced_at: string | null;
  match_confidence: string;
  post_type: string | null;
  studio_template: string | null;
};

type Metric = "views" | "likes" | "comments" | "shares";
type Timeframe = "7d" | "30d" | "90d" | "all";
type Tab = "overview" | "content" | "timing" | "platforms";

const METRICS: { id: Metric; label: string; icon: string; field: keyof Row }[] = [
  { id: "views", label: "Views", icon: "eye", field: "view_count" },
  { id: "likes", label: "Likes", icon: "heart", field: "like_count" },
  { id: "comments", label: "Comments", icon: "chat", field: "comment_count" },
  { id: "shares", label: "Shares", icon: "share", field: "share_count" },
];

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "chart" },
  { id: "content", label: "Content", icon: "stack" },
  { id: "timing", label: "Timing", icon: "clock" },
  { id: "platforms", label: "Platforms", icon: "globe" },
];

const TIMEFRAMES: { id: Timeframe; label: string; days: number | null }[] = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

const TYPE_LABEL: Record<string, string> = {
  video: "Video",
  image: "Image",
  text: "Text",
  story: "Story",
};

const STUDIO_LABEL: Record<string, string> = {
  "grid-2x2": "2x2 Grid Video",
  "fade-in": "Video Editor",
  "ai-ugc": "AI UGC Video",
  slideshow: "Slideshow",
  thumbnail: "Thumbnail Maker",
};

export function AnalyticsView({
  rows,
  weeklyGoal,
  postedThisWeek,
}: {
  rows: Row[];
  weeklyGoal: number;
  postedThisWeek: number;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [metric, setMetric] = useState<Metric>("views");
  const [platform, setPlatform] = useState<string | null>(null);
  // Display-only preview of a populated dashboard, reachable only from the
  // empty state. Never persisted, never mixed with real rows.
  const [preview, setPreview] = useState(false);

  const days = TIMEFRAMES.find((t) => t.id === timeframe)!.days;
  const field = METRICS.find((m) => m.id === metric)!.field;

  /** The current slice, plus the immediately preceding equal-length window so
   *  every stat tile can show a real delta rather than a decorative one. */
  const { current, previous, buckets } = useMemo(() => {
    const source = preview ? (sampleAnalytics() as Row[]) : rows;
    const scoped = platform ? source.filter((r) => r.platform === platform) : source;
    const dated = scoped.filter((r) => r.platform_created_at);
    if (days === null) {
      // "All time" buckets across the real data range, not a fixed 30 — a
      // window narrower than the totals makes the chart contradict the KPI
      // row sitting directly above it.
      const oldest = dated.reduce(
        (min, r) => Math.min(min, new Date(r.platform_created_at!).getTime()),
        Date.now()
      );
      const span = Math.max(7, Math.ceil((Date.now() - oldest) / 86_400_000) + 1);
      return { current: scoped, previous: [] as Row[], buckets: bucketByDay(dated, span) };
    }
    const now = Date.now();
    const start = now - days * 86_400_000;
    const prevStart = start - days * 86_400_000;
    const at = (r: Row) => new Date(r.platform_created_at!).getTime();
    return {
      current: dated.filter((r) => at(r) >= start),
      previous: dated.filter((r) => at(r) >= prevStart && at(r) < start),
      buckets: bucketByDay(dated.filter((r) => at(r) >= start), days),
    };
  }, [rows, platform, days, preview]);

  const totals = useMemo(
    () => ({
      views: current.reduce((s, r) => s + r.view_count, 0),
      likes: current.reduce((s, r) => s + r.like_count, 0),
      comments: current.reduce((s, r) => s + r.comment_count, 0),
      shares: current.reduce((s, r) => s + r.share_count, 0),
    }),
    [current]
  );
  const prevTotals = useMemo(
    () => ({
      views: previous.reduce((s, r) => s + r.view_count, 0),
      likes: previous.reduce((s, r) => s + r.like_count, 0),
      comments: previous.reduce((s, r) => s + r.comment_count, 0),
      shares: previous.reduce((s, r) => s + r.share_count, 0),
    }),
    [previous]
  );

  const delta = (now: number, before: number) =>
    previous.length === 0 || before === 0 ? null : ((now - before) / before) * 100;

  // A stable key so a filter change remounts the charts and replays their
  // entry animations — the movement is what tells you the data changed.
  const animKey = `${timeframe}-${metric}-${platform ?? "all"}-${tab}-${preview}`;

  const hasData = rows.length > 0 || preview;

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            How your posts actually performed — views, engagement, timing and format.
          </p>
        </div>
        <SyncButton />
      </div>

      {/* One filter row, above everything it scopes. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[10px] border border-line bg-white p-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={timeframe === t.id}
              onClick={() => setTimeframe(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                timeframe === t.id ? "bg-primary text-primary-contrast" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-[10px] border border-line bg-white p-0.5">
          <button
            type="button"
            aria-pressed={platform === null}
            onClick={() => setPlatform(null)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              platform === null ? "bg-primary-soft text-primary-deep" : "text-muted hover:text-ink"
            }`}
          >
            All platforms
          </button>
          {ANALYTICS_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={platform === p}
              onClick={() => setPlatform(platform === p ? null : p)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                platform === p ? "bg-primary-soft text-primary-deep" : "text-muted hover:text-ink"
              }`}
            >
              <PlatformIcon id={p} size={13} /> {platformOf(p)?.name}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs font-semibold text-muted">
          {current.length} tracked post{current.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.id ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <div className="card mt-6 grid place-items-center px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-deep">
            <Icon name="chart" size={22} />
          </span>
          <p className="mt-3 text-lg font-bold">No analytics yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Publish to any of your {ANALYTICS_PLATFORMS.length} connected platforms, then hit Sync —
            every chart here fills in from your own posts.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/dashboard/create/video" className="btn-primary">
              <Icon name="plus" size={15} /> Create a post
            </Link>
            <button type="button" className="btn-subtle" onClick={() => setPreview(true)}>
              <Icon name="eye" size={15} /> Preview with sample data
            </button>
          </div>
        </div>
      ) : (
        <div key={animKey} className="fade-up">
          {preview && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-warning-ink/20 bg-warning-bg px-4 py-2.5">
              <Icon name="flask" size={15} className="text-warning-ink" />
              <p className="text-xs font-bold text-warning-ink">
                Sample data — nothing here is from your account.
              </p>
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="ml-auto text-xs font-bold text-warning-ink underline underline-offset-2"
              >
                Exit preview
              </button>
            </div>
          )}
          {tab === "overview" && (
            <Overview
              current={current}
              totals={totals}
              prevTotals={prevTotals}
              delta={delta}
              buckets={buckets}
              metric={metric}
              setMetric={setMetric}
              field={field}
              previousCount={previous.length}
            />
          )}
          {tab === "content" && <Content current={current} field={field} metric={metric} setMetric={setMetric} />}
          {tab === "timing" && (
            <Timing current={current} field={field} metric={metric} weeklyGoal={weeklyGoal} postedThisWeek={postedThisWeek} />
          )}
          {tab === "platforms" && <Platforms current={current} buckets={buckets} field={field} metric={metric} />}
        </div>
      )}
    </div>
  );
}

/* ── Overview ───────────────────────────────────────────────────────────── */

function Overview({
  current,
  totals,
  prevTotals,
  delta,
  buckets,
  metric,
  setMetric,
  field,
  previousCount,
}: {
  current: Row[];
  totals: Record<Metric, number>;
  prevTotals: Record<Metric, number>;
  delta: (a: number, b: number) => number | null;
  buckets: Bucket[];
  metric: Metric;
  setMetric: (m: Metric) => void;
  field: keyof Row;
  previousCount: number;
}) {
  const er = engagementRate(current);
  const labels = buckets.map((b) => b.label);

  // One total line, not eleven. Past ~4 series lines converge into noise, and
  // there is no honest way to give 11 platforms 11 distinguishable hues — the
  // per-platform trends live as small multiples on the Platforms tab, and the
  // filter row above scopes this chart to a single platform on demand.
  const series: ChartSeries[] = [
    {
      id: "total",
      label: METRICS.find((m) => m.id === metric)!.label,
      color: ACCENT,
      points: buckets.map((b) => b.rows.reduce((s, r) => s + (r[field] as number), 0)),
    },
  ];

  // Ranked bars rather than an 11-slice donut: bar length carries magnitude
  // and the platform icon carries identity, so no invented hues are needed.
  const platformRanked = ANALYTICS_PLATFORMS.map((p) => ({
    id: p,
    label: platformOf(p)?.name ?? p,
    value: current.filter((r) => r.platform === p).reduce((s, r) => s + (r[field] as number), 0),
    posts: current.filter((r) => r.platform === p).length,
  }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const platformTotal = platformRanked.reduce((s, x) => s + x.value, 0);

  // Three slices, validated all-pairs — the one place a donut is the right form.
  const mixSlices = [
    { id: "likes", label: "Likes", value: totals.likes, color: SERIES[0] },
    { id: "comments", label: "Comments", value: totals.comments, color: SERIES[1] },
    { id: "shares", label: "Shares", value: totals.shares, color: SERIES[2] },
  ].filter((s) => s.value > 0);

  const topPosts = [...current]
    .sort((a, b) => (b[field] as number) - (a[field] as number))
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      label: r.video_description?.slice(0, 40) || "Untitled post",
      sub: platformOf(r.platform)?.name ?? r.platform,
      value: r[field] as number,
    }));

  return (
    <>
      {/* KPI row — tiles double as the metric switcher for every chart below. */}
      <div className="card mt-6 overflow-hidden">
        <div className="grid grid-cols-2 divide-line lg:grid-cols-5 lg:divide-x">
          {METRICS.map((m) => (
            <StatTile
              key={m.id}
              label={m.label}
              value={totals[m.id]}
              delta={delta(totals[m.id], prevTotals[m.id])}
              spark={buckets.map((b) => b.rows.reduce((s, r) => s + (r[m.field] as number), 0))}
              icon={<Icon name={m.icon} size={13} />}
              active={metric === m.id}
              onClick={() => setMetric(m.id)}
            />
          ))}
          <StatTile
            label="Engagement"
            value={er}
            suffix="%"
            delta={null}
            spark={buckets.map((b) => engagementRate(b.rows))}
            icon={<Icon name="zap" size={13} />}
          />
        </div>
        {previousCount === 0 && (
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            No posts in the previous period yet — deltas appear once there's a window to compare against.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">
              {METRICS.find((m) => m.id === metric)!.label} over time
            </h2>
            <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} />
          </div>
          {series.length === 0 ? (
            <ChartEmpty message="Nothing posted in this window." />
          ) : (
            <div className="mt-3">
              <LineChart series={series} labels={labels} valueLabel={metric} />
            </div>
          )}
          <TableView
            caption={`${metric} over time`}
            columns={["Date", ...series.map((s) => s.label)]}
            rows={buckets.map((b, i) => [b.label, ...series.map((s) => full(s.points[i]))])}
          />
        </section>

        <section className="card p-5">
          <h2 className="font-bold">Engagement mix</h2>
          <p className="mt-0.5 text-xs text-muted">What kind of reaction your posts earn.</p>
          <div className="mt-4">
            {mixSlices.length === 0 ? (
              <ChartEmpty message="No engagement in this window." />
            ) : (
              <Donut
                slices={mixSlices}
                total={mixSlices.reduce((s, x) => s + x.value, 0)}
                centerLabel="interactions"
              />
            )}
          </div>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">{METRICS.find((m) => m.id === metric)!.label} by platform</h2>
          <p className="text-xs text-muted">{platformRanked.length} of {ANALYTICS_PLATFORMS.length} platforms active</p>
        </div>
        <div className="mt-4">
          {platformRanked.length === 0 ? (
            <ChartEmpty message="No platform data in this window." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {platformRanked.map((p) => {
                const pct = platformTotal > 0 ? (p.value / platformTotal) * 100 : 0;
                const widest = platformRanked[0].value || 1;
                return (
                  <div key={p.id} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <PlatformIcon id={p.id} size={15} />
                      <span className="truncate text-xs font-semibold text-ink">{p.label}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-4 min-w-0 flex-1">
                        <div
                          className="chart-grow h-4 rounded-r-[4px] transition-[width] duration-500 ease-out"
                          style={{ width: `${Math.max((p.value / widest) * 100, 1.5)}%`, background: ACCENT }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-ink">
                        {compact(p.value)}
                      </span>
                      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <TableView
          caption={`${metric} by platform`}
          columns={["Platform", "Posts", METRICS.find((m) => m.id === metric)!.label, "Share"]}
          rows={platformRanked.map((p) => [
            p.label,
            String(p.posts),
            full(p.value),
            `${platformTotal > 0 ? Math.round((p.value / platformTotal) * 100) : 0}%`,
          ])}
        />
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-bold">Top posts</h2>
        <p className="mt-0.5 text-xs text-muted">
          Your best {metric} in this window — the shape worth making more of.
        </p>
        <div className="mt-4">
          {topPosts.length === 0 ? (
            <ChartEmpty message="No posts in this window." />
          ) : (
            <BarChart bars={topPosts} />
          )}
        </div>
      </section>
    </>
  );
}

/* ── Content ────────────────────────────────────────────────────────────── */

function Content({
  current,
  field,
  metric,
  setMetric,
}: {
  current: Row[];
  field: keyof Row;
  metric: Metric;
  setMetric: (m: Metric) => void;
}) {
  const byType = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of current) {
      const key = r.post_type ?? "unknown";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()]
      .map(([type, rs]) => ({
        id: type,
        label: TYPE_LABEL[type] ?? "Unknown",
        sub: `${rs.length} post${rs.length === 1 ? "" : "s"}`,
        value: Math.round(rs.reduce((s, r) => s + (r[field] as number), 0) / rs.length),
        er: engagementRate(rs),
      }))
      .sort((a, b) => b.value - a.value);
  }, [current, field]);

  const byStudio = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of current) {
      if (!r.studio_template) continue;
      groups.set(r.studio_template, [...(groups.get(r.studio_template) ?? []), r]);
    }
    return [...groups.entries()]
      .map(([tpl, rs]) => ({
        id: tpl,
        label: STUDIO_LABEL[tpl] ?? tpl,
        sub: `${rs.length} post${rs.length === 1 ? "" : "s"}`,
        value: Math.round(rs.reduce((s, r) => s + (r[field] as number), 0) / rs.length),
      }))
      .sort((a, b) => b.value - a.value);
  }, [current, field]);

  const mix = useMemo(
    () =>
      [...new Set(current.map((r) => r.post_type ?? "unknown"))].map((type) => {
        const rs = current.filter((r) => (r.post_type ?? "unknown") === type);
        return {
          id: type,
          label: TYPE_LABEL[type] ?? "Unknown",
          values: {
            likes: rs.reduce((s, r) => s + r.like_count, 0),
            comments: rs.reduce((s, r) => s + r.comment_count, 0),
            shares: rs.reduce((s, r) => s + r.share_count, 0),
          },
        };
      }),
    [current]
  );

  const table = [...current].sort((a, b) => (b[field] as number) - (a[field] as number)).slice(0, 25);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted">Rank by</span>
        {METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={metric === m.id}
            onClick={() => setMetric(m.id)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
              metric === m.id
                ? "border-primary bg-primary-soft text-primary-deep"
                : "border-line bg-white text-muted hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">Average {metric} by format</h2>
          <p className="mt-0.5 text-xs text-muted">
            Per-post average, so a format isn&apos;t just winning on volume.
          </p>
          <div className="mt-4">
            {byType.length === 0 ? <ChartEmpty message="No posts in this window." /> : <BarChart bars={byType} />}
          </div>
          <TableView
            caption="Average performance by post format"
            columns={["Format", "Posts", `Avg ${metric}`, "Engagement"]}
            rows={byType.map((t) => [t.label, t.sub.split(" ")[0], full(t.value), `${t.er.toFixed(1)}%`])}
          />
        </section>

        <section className="card p-5">
          <h2 className="font-bold">Engagement mix by format</h2>
          <p className="mt-0.5 text-xs text-muted">What kind of reaction each format earns.</p>
          <div className="mt-3">
            <Legend
              items={[
                { id: "likes", label: "Likes", color: SERIES[0] },
                { id: "comments", label: "Comments", color: SERIES[1] },
                { id: "shares", label: "Shares", color: SERIES[2] },
              ]}
            />
          </div>
          <div className="mt-4">
            {mix.length === 0 ? (
              <ChartEmpty message="No posts in this window." />
            ) : (
              <StackedBars
                rows={mix}
                keys={[
                  { id: "likes", label: "Likes", color: SERIES[0] },
                  { id: "comments", label: "Comments", color: SERIES[1] },
                  { id: "shares", label: "Shares", color: SERIES[2] },
                ]}
              />
            )}
          </div>
          <TableView
            caption="Engagement mix by post format"
            columns={["Format", "Likes", "Comments", "Shares"]}
            rows={mix.map((m) => [m.label, full(m.values.likes), full(m.values.comments), full(m.values.shares)])}
          />
        </section>
      </div>

      {byStudio.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="font-bold">Content Studio templates</h2>
          <p className="mt-0.5 text-xs text-muted">
            Average {metric} per post, by the template that produced the media.
          </p>
          <div className="mt-4">
            <BarChart bars={byStudio} />
          </div>
        </section>
      )}

      <section className="card mt-4 overflow-hidden p-0">
        <h2 className="px-5 pt-5 font-bold">Every tracked post</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold text-muted">
                <th className="px-5 py-2.5">Post</th>
                <th className="px-2 py-2.5">Platform</th>
                <th className="px-2 py-2.5">Format</th>
                <th className="px-2 py-2.5 text-right">Views</th>
                <th className="px-2 py-2.5 text-right">Likes</th>
                <th className="px-2 py-2.5 text-right">Comments</th>
                <th className="px-2 py-2.5 text-right">Shares</th>
                <th className="px-2 py-2.5 text-right">Eng.</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {table.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-muted">
                    Nothing tracked in this window yet.
                  </td>
                </tr>
              )}
              {table.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-page/60">
                  <td className="max-w-64 px-5 py-2.5">
                    <span className="flex items-center gap-2">
                      {r.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.cover_image_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-page text-muted">
                          <Icon name="video" size={14} />
                        </span>
                      )}
                      <span className="truncate">{r.video_description || "—"}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <PlatformIcon id={r.platform} size={16} />
                  </td>
                  <td className="px-2 py-2.5 text-xs text-muted">{TYPE_LABEL[r.post_type ?? ""] ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{compact(r.view_count)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{compact(r.like_count)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{compact(r.comment_count)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{compact(r.share_count)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{engagementRate([r]).toFixed(1)}%</td>
                  <td className="px-5 py-2.5">
                    {r.share_url && (
                      <a
                        href={r.share_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-deep"
                        aria-label="Open on platform"
                      >
                        <Icon name="external" size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ── Timing ─────────────────────────────────────────────────────────────── */

const HOUR_BLOCKS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Timing({
  current,
  field,
  metric,
  weeklyGoal,
  postedThisWeek,
}: {
  current: Row[];
  field: keyof Row;
  metric: Metric;
  weeklyGoal: number;
  postedThisWeek: number;
}) {
  const grid = useMemo(() => timingGrid(current, (r) => r[field] as number), [current, field]);

  const byDay = useMemo(() => {
    const groups: Row[][] = Array.from({ length: 7 }, () => []);
    for (const r of current) {
      if (r.platform_created_at) groups[new Date(r.platform_created_at).getDay()].push(r);
    }
    return groups
      .map((rs, d) => ({
        id: String(d),
        label: DAY_NAMES[d],
        sub: `${rs.length} post${rs.length === 1 ? "" : "s"}`,
        value: rs.length ? Math.round(rs.reduce((s, r) => s + (r[field] as number), 0) / rs.length) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [current, field]);

  const best = byDay[0];
  const bestSlot = useMemo(() => {
    let top = { d: -1, b: -1, v: 0 };
    grid.forEach((row, d) => row.forEach((v, b) => { if (v > top.v) top = { d, b, v }; }));
    return top;
  }, [grid]);

  return (
    <>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="card p-5">
          <h2 className="font-bold">When your posts land</h2>
          <p className="mt-0.5 text-xs text-muted">
            Average {metric} per post by day and time — darker is better. Times are your local timezone.
          </p>
          <div className="mt-4">
            <Heatmap cells={grid} hourBlocks={HOUR_BLOCKS} metricLabel={metric} />
          </div>
          {bestSlot.d >= 0 && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-deep">
              <Icon name="zap" size={13} />
              Your strongest slot is {DAY_NAMES[bestSlot.d]} around {HOUR_BLOCKS[bestSlot.b]} — {full(bestSlot.v)}{" "}
              {metric} per post.
            </p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-bold">Best day to post</h2>
          <p className="mt-0.5 text-xs text-muted">Average {metric} per post.</p>
          <div className="mt-4">
            {byDay.every((d) => d.value === 0) ? (
              <ChartEmpty message="No posts in this window." />
            ) : (
              <BarChart bars={byDay.filter((d) => d.value > 0)} />
            )}
          </div>
          {best && best.value > 0 && (
            <p className="mt-3 text-xs text-muted">
              <span className="font-bold text-ink">{best.label}</span> is your strongest day so far.
            </p>
          )}
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="font-bold">Posting consistency</h2>
        <p className="mt-0.5 text-xs text-muted">
          Consistency beats any single post — the algorithm rewards showing up.
        </p>
        <div className="mt-4 max-w-md">
          <Meter value={postedThisWeek} target={weeklyGoal} label="Posts published this week" />
          <p className="mt-2 text-xs text-muted">
            {postedThisWeek >= weeklyGoal
              ? "Goal hit for this week — nice."
              : `${weeklyGoal - postedThisWeek} more to hit your weekly goal.`}{" "}
            <Link href="/dashboard/settings" className="font-semibold text-primary-deep hover:underline">
              Change goal
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

/* ── Platforms ──────────────────────────────────────────────────────────── */

function Platforms({
  current,
  buckets,
  field,
  metric,
}: {
  current: Row[];
  buckets: Bucket[];
  field: keyof Row;
  metric: Metric;
}) {
  return (
    <>
      {/* Small multiples — one card per platform, same scale story each time.
          Active platforms sort first so 11 cards don't bury the ones with
          data, but the quiet ones stay visible: "nothing on Tumblr yet" is
          itself worth seeing. */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...ANALYTICS_PLATFORMS]
          .sort(
            (a, b) =>
              current.filter((r) => r.platform === b).length -
              current.filter((r) => r.platform === a).length
          )
          .map((p) => {
          const rows = current.filter((r) => r.platform === p);
          const views = rows.reduce((s, r) => s + r.view_count, 0);
          const er = engagementRate(rows);
          const points = buckets.map((b) =>
            b.rows.filter((r) => r.platform === p).reduce((s, r) => s + (r[field] as number), 0)
          );
          return (
            <section key={p} className="card p-5">
              <div className="flex items-center gap-2">
                <PlatformIcon id={p} size={20} />
                <h2 className="font-bold">{platformOf(p)?.name}</h2>
                <span className="ml-auto">
                  <SyncButton platform={p} />
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="mt-4 py-6 text-center text-sm text-muted">No tracked posts in this window.</p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      ["Posts", String(rows.length)],
                      ["Views", compact(views)],
                      ["Eng.", `${er.toFixed(1)}%`],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[11px] font-bold text-muted">{label}</p>
                        <p className="mt-0.5 text-lg font-bold tracking-tight">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <LineChart
                      series={[{ id: p, label: platformOf(p)?.name ?? p, color: ACCENT, points }]}
                      labels={buckets.map((b) => b.label)}
                      height={120}
                      valueLabel={metric}
                    />
                  </div>
                </>
              )}
            </section>
          );
          })}
      </div>

      <section className="card mt-4 p-5">
        <h2 className="font-bold">Engagement mix by platform</h2>
        <p className="mt-0.5 text-xs text-muted">Which reactions each audience actually gives you.</p>
        <div className="mt-3">
          <Legend
            items={[
              { id: "likes", label: "Likes", color: SERIES[0] },
              { id: "comments", label: "Comments", color: SERIES[1] },
              { id: "shares", label: "Shares", color: SERIES[2] },
            ]}
          />
        </div>
        <div className="mt-4">
          <StackedBars
            rows={ANALYTICS_PLATFORMS.map((p) => {
              const rows = current.filter((r) => r.platform === p);
              return {
                id: p,
                label: platformOf(p)?.name ?? p,
                values: {
                  likes: rows.reduce((s, r) => s + r.like_count, 0),
                  comments: rows.reduce((s, r) => s + r.comment_count, 0),
                  shares: rows.reduce((s, r) => s + r.share_count, 0),
                },
              };
            }).filter((r) => r.values.likes + r.values.comments + r.values.shares > 0)}
            keys={[
              { id: "likes", label: "Likes", color: SERIES[0] },
              { id: "comments", label: "Comments", color: SERIES[1] },
              { id: "shares", label: "Shares", color: SERIES[2] },
            ]}
          />
        </div>
      </section>
    </>
  );
}

type Bucket = ShapeBucket<Row>;
