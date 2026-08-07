// Check for lib/analytics-shape.ts — run with `npm run check:analytics`.
//
// Same pattern as check-media-filters.mjs: the npm script compiles the
// (dependency-free) module with the TypeScript already installed and runs
// these assertions on the output. Plain node, no new packages.
//
// What it's really guarding: the Analytics dashboard's date-window math. A
// post that falls between two buckets vanishes from the trend line while
// still counting in the totals above it — the numbers disagree with the
// chart and nothing throws. Also guards the averaging in the timing grid
// (summing would make "post more often" look like "post better") and the
// axis top (a series overflowing its own plot).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const A = require("../node_modules/.cache/checks/lib/analytics-shape.js");

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra && !cond ? " — " + extra : ""}`);
};

const row = (iso, v = 100, l = 10, c = 1, s = 2) => ({
  platform_created_at: iso,
  view_count: v,
  like_count: l,
  comment_count: c,
  share_count: s,
});

/* ── bucketByDay: every row lands in exactly one bucket ──────────────────── */

const NOW = new Date("2026-08-06T12:00:00");
const daysAgo = (n, h = 12) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

for (const days of [7, 30, 90]) {
  // One post per day across the whole window.
  const rows = Array.from({ length: days }, (_, i) => row(daysAgo(i)));
  const buckets = A.bucketByDay(rows, days, NOW);

  ok(`${days}d: at most 12 buckets`, buckets.length <= 12, String(buckets.length));

  const placed = buckets.reduce((s, b) => s + b.rows.length, 0);
  ok(`${days}d: every post lands in a bucket (${placed}/${rows.length})`, placed === rows.length);

  // No row counted twice.
  const seen = buckets.flatMap((b) => b.rows);
  ok(`${days}d: no post counted twice`, new Set(seen).size === seen.length);

  // Buckets are contiguous and ascending — a gap is where posts disappear.
  const contiguous = buckets.every(
    (b, i) => i === 0 || b.start > buckets[i - 1].end - 86_400_000
  );
  ok(`${days}d: buckets ascend without gaps`, contiguous);
  ok(`${days}d: each bucket ends after it starts`, buckets.every((b) => b.end > b.start));
}

// A post made in the final moment of today must still appear.
const endOfToday = new Date(NOW);
endOfToday.setHours(23, 59, 59, 999);
const lastMs = A.bucketByDay([row(endOfToday.toISOString())], 7, NOW);
ok("post at the very end of today is not dropped", lastMs.reduce((s, b) => s + b.rows.length, 0) === 1);

// Junk timestamps are skipped, never crash or land somewhere arbitrary.
const junk = A.bucketByDay([{ platform_created_at: null }, { platform_created_at: "nonsense" }], 7, NOW);
ok("null / unparseable dates are skipped", junk.reduce((s, b) => s + b.rows.length, 0) === 0);

/* ── engagementRate ──────────────────────────────────────────────────────── */

ok("engagement rate is acts ÷ views", A.engagementRate([row("x", 100, 10, 1, 2)]) === 13);
ok("zero views is 0, not NaN", A.engagementRate([row("x", 0, 0, 0, 0)]) === 0);
ok("empty set is 0", A.engagementRate([]) === 0);

/* ── niceMax: a series can never overflow its own plot ───────────────────── */

for (const v of [1, 9, 10, 11, 99, 100, 240, 999, 1000, 1001, 24_000, 987_654]) {
  if (A.niceMax(v) < v) ok(`niceMax(${v}) >= ${v}`, false, String(A.niceMax(v)));
}
ok("niceMax always clears its input", [1, 9, 11, 99, 240, 1001, 987_654].every((v) => A.niceMax(v) >= v));
ok("niceMax(0) is 1, never 0", A.niceMax(0) === 1);
ok("niceMax rounds to a clean top", A.niceMax(240) === 250 && A.niceMax(1001) === 2000);

/* ── timingGrid: averages, not sums ──────────────────────────────────────── */

// Thursday 2026-08-06 is day 4; 12:00 falls in block 4 (12p–3p).
const thu = (h) => {
  const d = new Date(NOW);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
const grid = A.timingGrid([row(thu(13), 100), row(thu(14), 300)], (r) => r.view_count);
ok("timing grid averages same-slot posts (200, not 400)", grid[4][4] === 200, String(grid[4][4]));
ok("timing grid is 7 x 8", grid.length === 7 && grid.every((r) => r.length === 8));
ok("empty slots are 0", grid[0][0] === 0);

const late = A.timingGrid([row(thu(23), 50)], (r) => r.view_count);
ok("23:00 lands in the last block, not out of bounds", late[4][7] === 50);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
