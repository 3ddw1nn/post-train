// Pure shaping helpers for the Analytics dashboard — the date-window and
// aggregation math, kept out of the view so it can be checked without a
// browser (`npm run check:analytics`). No JSX, no imports.
//
// Same split as lib/media-filters.ts: the arithmetic that's easy to get
// quietly wrong lives here; components/charts.tsx renders it.

/** The subset of an analytics row this module needs. Structural, so the
 *  dashboard's `Row` satisfies it without importing anything. */
export type Measurable = {
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  platform_created_at: string | null;
};

/** Engagement rate = interactions ÷ views, as a percentage. The number
 *  creators optimize for — raw views reward luck, this rewards the content.
 *  Zero views is 0, never NaN or Infinity. */
export function engagementRate(rows: Measurable[]): number {
  const views = rows.reduce((s, r) => s + r.view_count, 0);
  if (views <= 0) return 0;
  const acts = rows.reduce((s, r) => s + r.like_count + r.comment_count + r.share_count, 0);
  return (acts / views) * 100;
}

/** Round a max up to a clean axis top so ticks read 0 / 1,000 / 2,000.
 *  Always ≥ the input, so a series can never overflow its own plot. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => value <= s * magnitude) ?? 10;
  return step * magnitude;
}

export type Bucket<T> = { label: string; start: number; end: number; rows: T[] };

/**
 * Group rows into at most 12 evenly spaced date buckets ending today, so a
 * 7-day and a 90-day window both render a readable line instead of 90 cramped
 * ticks.
 *
 * Buckets are contiguous and half-open at the top (`start <= t < end`) except
 * the last, which includes the end of today — otherwise a post made in the
 * final millisecond of the window would be silently dropped from the chart
 * while still counting toward the totals above it.
 */
export function bucketByDay<T extends { platform_created_at: string | null }>(
  rows: T[],
  days: number,
  now: Date = new Date()
): Bucket<T>[] {
  const count = Math.min(12, Math.max(1, days));
  const span = Math.ceil(days / count);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const buckets: Bucket<T>[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = new Date(todayEnd);
    end.setDate(end.getDate() - i * span);
    const start = new Date(end);
    start.setDate(start.getDate() - span + 1);
    start.setHours(0, 0, 0, 0);
    buckets.push({
      label: end.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      start: start.getTime(),
      end: end.getTime(),
      rows: [],
    });
  }

  for (const row of rows) {
    if (!row.platform_created_at) continue;
    const t = new Date(row.platform_created_at).getTime();
    if (Number.isNaN(t)) continue;
    // Last bucket wins ties at a boundary, so a row lands in exactly one.
    const hit = buckets.findLast((b) => t >= b.start && t <= b.end);
    if (hit) hit.rows.push(row);
  }
  return buckets;
}

/** Day-of-week × 3-hour-block grid of *average* value per post. Averaging
 *  rather than summing is the point: a slot must not look "best" merely
 *  because you happened to post in it more often. */
export function timingGrid<T extends { platform_created_at: string | null }>(
  rows: T[],
  value: (row: T) => number
): number[][] {
  const blocks = 8;
  const sums = Array.from({ length: 7 }, () => Array(blocks).fill(0));
  const counts = Array.from({ length: 7 }, () => Array(blocks).fill(0));
  for (const row of rows) {
    if (!row.platform_created_at) continue;
    const d = new Date(row.platform_created_at);
    if (Number.isNaN(d.getTime())) continue;
    const block = Math.min(blocks - 1, Math.floor(d.getHours() / 3));
    sums[d.getDay()][block] += value(row);
    counts[d.getDay()][block] += 1;
  }
  return sums.map((row, d) => row.map((v, b) => (counts[d][b] ? Math.round(v / counts[d][b]) : 0)));
}
