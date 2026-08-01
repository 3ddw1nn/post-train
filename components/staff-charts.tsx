"use client";

import { useState } from "react";

const VIEW_W = 600;
const VIEW_H = 190;
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

// Smallest "1/2/5 × 10^n" step at or above `n` — keeps gridline labels round.
function niceMax(n: number): number {
  if (n <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  for (const step of [1, 2, 5, 10]) {
    if (step * pow >= n) return step * pow;
  }
  return 10 * pow;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TrendChart({ data, color = "var(--color-primary)" }: { data: { date: string; count: number }[]; color?: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const n = data.length;
  const yMax = niceMax(Math.max(1, ...data.map((d) => d.count)));
  const xAt = (i: number) => PAD_L + (n === 1 ? 0 : (i / (n - 1)) * PLOT_W);
  const yAt = (count: number) => PAD_T + PLOT_H - (count / yMax) * PLOT_H;
  const baseline = PAD_T + PLOT_H;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d.count)}`).join(" ");
  const areaPath = `${linePath} L${xAt(n - 1)},${baseline} L${xAt(0)},${baseline} Z`;

  const yTicks = [0, yMax / 2, yMax];
  const last = data[n - 1];
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full"
        role="img"
        aria-label={`Daily trend, ${data[0]?.date} to ${last?.date}`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const xUser = ((e.clientX - rect.left) / rect.width) * VIEW_W;
          const i = Math.round(((xUser - PAD_L) / PLOT_W) * (n - 1));
          setHoverIndex(Math.min(n - 1, Math.max(0, i)));
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={VIEW_W - PAD_R} y1={yAt(t)} y2={yAt(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD_L - 6} y={yAt(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[9px]">
              {Math.round(t)}
            </text>
          </g>
        ))}

        <text x={xAt(0)} y={VIEW_H - 8} textAnchor="start" className="fill-muted text-[9px]">
          {shortDate(data[0]?.date)}
        </text>
        <text x={xAt(n - 1)} y={VIEW_H - 8} textAnchor="end" className="fill-muted text-[9px]">
          {shortDate(last?.date)}
        </text>

        <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={xAt(n - 1)} cy={yAt(last.count)} r={4} fill={color} stroke="white" strokeWidth={2} />

        {hovered && hoverIndex !== null && (
          <>
            <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={PAD_T} y2={baseline} stroke="var(--color-line)" strokeWidth={1} />
            <circle cx={xAt(hoverIndex)} cy={yAt(hovered.count)} r={4} fill={color} stroke="white" strokeWidth={2} />
          </>
        )}

        <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="transparent" />
      </svg>

      {hovered && hoverIndex !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white shadow-lg"
          style={{ left: `${(xAt(hoverIndex) / VIEW_W) * 100}%`, top: `${(yAt(hovered.count) / VIEW_H) * 100}%` }}
        >
          {shortDate(hovered.date)} · {hovered.count}
        </div>
      )}
    </div>
  );
}

const PLAN_ORDER: { key: string; label: string; color: string }[] = [
  { key: "free", label: "Free", color: "var(--color-muted)" },
  { key: "creator", label: "Creator", color: "#2a78d6" },
  { key: "growth", label: "Growth", color: "#1baf7a" },
  { key: "pro", label: "Pro", color: "#eb6834" },
];

export function PlanMixBars({ counts, total }: { counts: Map<string, number>; total: number }) {
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {PLAN_ORDER.map(({ key, label, color }) => {
        const count = counts.get(key) ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-semibold text-ink">{label}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-page">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%`, backgroundColor: color }} />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
