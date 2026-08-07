"use client";

// Chart primitives for the Analytics dashboard — hand-rolled inline SVG.
//
// Deliberately not a charting library: the whole set below is smaller than the
// bundle any of them would add, and every chart here is one of five shapes we
// fully control. If this ever grows past ~6 shapes or needs zoom/brush, that's
// the point to reconsider.
//
// The palette is validated, not eyeballed — see PALETTE below.

import { useId, useRef, useState } from "react";
import { niceMax } from "@/lib/analytics-shape";

/* ── Palette ──────────────────────────────────────────────────────────────
 * Categorical slots come from the dataviz reference palette and are validated
 * against this app's white card surface:
 *   validate_palette.js "#2a78d6,#eb6834,#1baf7a" --mode light \
 *     --surface "#ffffff" --pairs all   → all checks pass
 * (--pairs all because the donut and small multiples put any two slices side
 * by side.) Aqua lands at 2.82:1, under the 3:1 mark floor, so every chart
 * using these ships the required relief: direct value labels plus a table
 * view. Do not re-order or re-step without re-running the validator.
 *
 * The brand teal is deliberately NOT a categorical slot — it measures OKLCH
 * chroma 0.093, under the 0.10 floor, so it reads gray next to real hues. It
 * serves as the single-series/sequential hue instead, where identity work
 * isn't being asked of it.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

/** Brand teal, ordinal-safe steps. Validated with --ordinal: monotone
 *  lightness, adjacent ΔL ≥ 0.06, light end 2.02:1 on white, hue spread 2°. */
export const TEAL_RAMP = ["#6ac6bc", "#33a89d", "#0e8177", "#0a5f59"] as const;
export const ACCENT = "#0e8177";
/** Sequential-only step for "near zero" heat cells — allowed to recede toward
 *  the surface because on a continuous scale that IS the meaning. */
export const TEAL_ZERO = "#eaf5f3";

const GRID = "#e3e8e7";
const AXIS_TEXT = "#6b7280";
const SURFACE = "#ffffff";

/* ── Formatting ─────────────────────────────────────────────────────────── */

export function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export const full = (n: number) => Math.round(n).toLocaleString();

/* ── Tooltip ────────────────────────────────────────────────────────────── */

type TipRow = { label: string; value: string; color?: string };

function Tooltip({ x, y, title, rows }: { x: number; y: number; title: string; rows: TipRow[] }) {
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-32 -translate-x-1/2 rounded-lg border border-line bg-white px-2.5 py-2 shadow-lg"
      style={{ left: x, top: y }}
      role="status"
    >
      <p className="text-[11px] font-semibold text-muted">{title}</p>
      <div className="mt-1 flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
            {/* Values lead, labels follow — the reader has the series and wants the number. */}
            <span className="text-xs font-bold tabular-nums text-ink">{r.value}</span>
            <span className="truncate text-[11px] text-muted">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sparkline ──────────────────────────────────────────────────────────── */

export function Sparkline({ points, color = ACCENT }: { points: number[]; color?: string }) {
  const w = 96;
  const h = 28;
  if (points.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const xy = points.map((p, i) => [i * step, h - 2 - ((p - min) / span) * (h - 4)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke={SURFACE} strokeWidth={2} />
    </svg>
  );
}

/* ── Line chart ─────────────────────────────────────────────────────────── */

export type Series = { id: string; label: string; color: string; points: number[] };

/**
 * Multi-series line with a snapping crosshair. One y-axis only — a second
 * scale would invent a correlation that isn't in the data.
 */
export function LineChart({
  series,
  labels,
  height = 240,
  valueLabel = "",
}: {
  series: Series[];
  labels: string[];
  height?: number;
  valueLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const w = 720;
  const padL = 44;
  const padR = 12;
  const padT = 10;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;

  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.points)));
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  // Show at most ~6 x labels so they never collide.
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div ref={wrap} className="relative">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Line chart: ${series.map((s) => s.label).join(", ")}`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * w;
          const i = Math.round(((px - padL) / plotW) * (n - 1));
          setHover(i >= 0 && i < n ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT} className="tabular-nums">
              {compact(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              {l}
            </text>
          ) : null
        )}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke={AXIS_TEXT} strokeWidth={1} opacity={0.35} />
        )}

        {series.map((s) => {
          const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
          return (
            <g key={s.id}>
              {series.length === 1 && (
                <path d={`${d} L${x(n - 1)} ${padT + plotH} L${x(0)} ${padT + plotH} Z`} fill={s.color} opacity={0.1} />
              )}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="chart-draw"
              />
              {hover !== null && s.points[hover] !== undefined && (
                <circle cx={x(hover)} cy={y(s.points[hover])} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip
          x={(x(hover) / w) * (wrap.current?.clientWidth ?? w)}
          y={8}
          title={labels[hover] ?? ""}
          rows={series.map((s) => ({
            label: `${s.label}${valueLabel ? ` ${valueLabel}` : ""}`,
            value: full(s.points[hover] ?? 0),
            color: s.color,
          }))}
        />
      )}
    </div>
  );
}

/* ── Bar chart (horizontal) ─────────────────────────────────────────────── */

export type Bar = { id: string; label: string; value: number; color?: string; sub?: string };

/**
 * Horizontal bars, one hue for one series. Values ride the bar tip, so the
 * numbers are readable without hovering (this is also the relief channel the
 * contrast WARN requires when a categorical hue is passed in).
 */
export function BarChart({ bars, unit = "" }: { bars: Bar[]; unit?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex flex-col gap-2.5">
      {bars.map((b) => (
        <div key={b.id} className="group grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink" title={b.label}>
              {b.label}
            </p>
            {b.sub && <p className="truncate text-[11px] text-muted">{b.sub}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 min-w-0 flex-1">
              <div
                className="chart-grow h-4 rounded-r-[4px] transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max((b.value / max) * 100, b.value > 0 ? 1.5 : 0)}%`, background: b.color ?? ACCENT }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-ink">
              {compact(b.value)}
              {unit}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Donut ──────────────────────────────────────────────────────────────── */

/**
 * Part-to-whole at a glance, ≤ 6 segments. Segments are separated by a 2px
 * surface gap rather than a stroke, and every slice is also printed as a
 * number in the legend — nothing is gated behind the color.
 */
export function Donut({
  slices,
  total,
  centerLabel,
}: {
  slices: { id: string; label: string; value: number; color: string }[];
  total: number;
  centerLabel: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const size = 168;
  const r = 62;
  const c = 2 * Math.PI * r;
  const gap = 2; // surface gap, in path units
  let offset = 0;
  const titleId = useId();

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={titleId}>
          <title id={titleId}>{centerLabel} split by platform</title>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={18} />
          {slices.map((s) => {
            const frac = total > 0 ? s.value / total : 0;
            const len = Math.max(frac * c - gap, 0);
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={s.id}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.id ? 22 : 18}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="chart-fade cursor-pointer transition-[stroke-width] duration-200"
                onPointerEnter={() => setHover(s.id)}
                onPointerLeave={() => setHover(null)}
              />
            );
            offset += frac * c;
            return el;
          })}
          <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={22} fontWeight={700} fill="#1c1c1e">
            {compact(total)}
          </text>
          <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
            {centerLabel}
          </text>
        </svg>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {slices.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors"
            style={{ background: hover === s.id ? "#f4f6f6" : undefined }}
            onPointerEnter={() => setHover(s.id)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{s.label}</span>
            <span className="text-xs font-bold tabular-nums text-ink">{compact(s.value)}</span>
            <span className="w-10 text-right text-[11px] tabular-nums text-muted">
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Stacked bars ───────────────────────────────────────────────────────── */

/** Part-to-whole across categories. Segments carry a 2px surface gap. */
export function StackedBars({
  rows,
  keys,
}: {
  rows: { id: string; label: string; values: Record<string, number> }[];
  keys: { id: string; label: string; color: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => keys.reduce((s, k) => s + (r.values[k.id] ?? 0), 0)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const total = keys.reduce((s, k) => s + (row.values[k.id] ?? 0), 0);
        return (
          <div key={row.id} className="grid grid-cols-[minmax(0,6rem)_1fr] items-center gap-3">
            <p className="truncate text-xs font-semibold text-ink">{row.label}</p>
            <div className="flex items-center gap-2">
              <div className="flex h-4 min-w-0 flex-1 gap-0.5" style={{ width: `${(total / max) * 100}%` }}>
                {keys.map((k, i) => {
                  const v = row.values[k.id] ?? 0;
                  if (v <= 0) return null;
                  return (
                    <div
                      key={k.id}
                      title={`${k.label}: ${full(v)}`}
                      className={`chart-grow h-4 transition-[flex-grow] duration-500 ease-out ${i === keys.length - 1 ? "rounded-r-[4px]" : ""}`}
                      style={{ flexGrow: v, background: k.color }}
                    />
                  );
                })}
              </div>
              <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-ink">{compact(total)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Heatmap ────────────────────────────────────────────────────────────── */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Day × hour-block grid. Sequential encoding (one hue, light→dark), so the
 * lightest step legitimately recedes toward the surface — on a continuous
 * scale "near zero" *is* near-nothing.
 */
export function Heatmap({
  cells,
  hourBlocks,
  metricLabel,
}: {
  /** `cells[day][block]` — day 0 = Sunday. */
  cells: number[][];
  hourBlocks: string[];
  metricLabel: string;
}) {
  const [hover, setHover] = useState<{ d: number; b: number } | null>(null);
  const max = Math.max(1, ...cells.flat());
  const color = (v: number) => {
    if (v <= 0) return TEAL_ZERO;
    const t = v / max;
    return TEAL_RAMP[Math.min(TEAL_RAMP.length - 1, Math.floor(t * TEAL_RAMP.length))];
  };

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="grid gap-1" style={{ gridTemplateColumns: `2.5rem repeat(${hourBlocks.length}, minmax(0,1fr))` }}>
            <span />
            {hourBlocks.map((h) => (
              <span key={h} className="text-center text-[10px] font-semibold text-muted">
                {h}
              </span>
            ))}
            {DAYS.map((day, d) => (
              <div key={day} className="contents">
                <span className="flex items-center text-[11px] font-semibold text-muted">{day}</span>
                {hourBlocks.map((_, b) => (
                  <button
                    key={b}
                    type="button"
                    aria-label={`${day} ${hourBlocks[b]}: ${full(cells[d]?.[b] ?? 0)} ${metricLabel}`}
                    onPointerEnter={() => setHover({ d, b })}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover({ d, b })}
                    onBlur={() => setHover(null)}
                    className="chart-fade h-7 rounded-[4px] transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    style={{ background: color(cells[d]?.[b] ?? 0) }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] text-muted">Less</span>
        {[TEAL_ZERO, ...TEAL_RAMP].map((c) => (
          <span key={c} className="h-3 w-5 rounded-sm" style={{ background: c }} />
        ))}
        <span className="text-[11px] text-muted">More</span>
        {hover && (
          <span className="ml-auto text-[11px] font-semibold text-ink">
            {DAYS[hover.d]} {hourBlocks[hover.b]} · {full(cells[hover.d]?.[hover.b] ?? 0)} {metricLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  delta,
  spark,
  icon,
  suffix = "",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  /** Percent change vs the previous equal-length period; null when there's no
   *  prior period to compare against. */
  delta: number | null;
  spark: number[];
  icon?: React.ReactNode;
  suffix?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const up = (delta ?? 0) >= 0;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-pressed": active } : {})}
      className={`flex w-full flex-col px-4 py-3.5 text-left transition-colors ${
        onClick ? "cursor-pointer hover:bg-page/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" : ""
      } ${active ? "bg-primary-soft/50" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
        {icon} {label}
      </span>
      <span className="mt-1 flex items-end justify-between gap-2">
        {/* Proportional figures — tabular-nums makes a big number look loose. */}
        <span className="text-2xl font-bold tracking-tight text-ink">
          {suffix ? `${value.toFixed(1)}${suffix}` : compact(value)}
        </span>
        <Sparkline points={spark} color={active ? ACCENT : "#9aa5a3"} />
      </span>
      {delta !== null && (
        <span className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${up ? "text-primary-deep" : "text-danger"}`}>
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true">
            <path
              d={up ? "M5 1.5 L9 8 L1 8 Z" : "M5 8.5 L1 2 L9 2 Z"}
              fill="currentColor"
            />
          </svg>
          {Math.abs(delta).toFixed(0)}%
          <span className="font-semibold text-muted">vs prev.</span>
        </span>
      )}
    </Tag>
  );
}

/* ── Empty / meter ──────────────────────────────────────────────────────── */

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line py-10 text-center">
      <p className="max-w-xs text-sm text-muted">{message}</p>
    </div>
  );
}

/** Single ratio against a limit. Unfilled track is a lighter step of the same
 *  ramp so state reads across the whole bar. */
export function Meter({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const hit = value >= target;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold text-muted">{label}</p>
        <p className="text-xs font-bold tabular-nums text-ink">
          {value} / {target}
        </p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: TEAL_ZERO }}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct * 100}%`, background: hit ? ACCENT : TEAL_RAMP[1] }}
        />
      </div>
    </div>
  );
}

/* ── Table view (the accessible twin every chart is required to have) ───── */

export function TableView({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: (string | number)[][];
  caption: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-4"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">
        {open ? "Hide" : "Show"} data table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-muted">
              {columns.map((c, i) => (
                <th key={c} scope="col" className={`py-1.5 pr-3 font-bold ${i ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.map((cell, j) => (
                  <td key={j} className={`py-1.5 pr-3 ${j ? "text-right tabular-nums" : "font-semibold"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Legend — always present for ≥ 2 series, so identity is never color-alone. */
export function Legend({ items }: { items: { id: string; label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: i.color }} />
          <span className="text-[11px] font-semibold text-muted">{i.label}</span>
        </li>
      ))}
    </ul>
  );
}
