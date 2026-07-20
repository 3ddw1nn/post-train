"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dropdown } from "@/components/interactive";
import { Icon } from "@/components/icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthPicker({
  label,
  year,
  month,
  day,
  view,
  platform,
  previewLocked,
}: {
  label: string;
  year: number;
  month: number;
  day: number;
  view: "month" | "week";
  platform?: string;
  previewLocked?: boolean;
}) {
  const [displayYear, setDisplayYear] = useState(year);
  const [displayMonth, setDisplayMonth] = useState(month);

  useEffect(() => {
    setDisplayYear(year);
    setDisplayMonth(month);
  }, [year, month]);

  const hrefFor = (nextYear: number, nextMonth: number, nextDay = 1) => {
    if (previewLocked) return "/dashboard/settings/plans";
    const params = new URLSearchParams({
      view,
      date: `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`,
    });
    if (platform) params.set("platform", platform);
    return `/dashboard/posts/calendar?${params}`;
  };
  const weeks = weekOptions(displayYear, displayMonth, year, month, day);

  return (
    <Dropdown
      width={view === "week" ? 380 : 308}
      trigger={
        <button
          type="button"
          className="flex min-w-40 items-center justify-center gap-2 rounded-lg px-3 py-2 text-center font-bold hover:bg-page"
          aria-label={view === "week" ? "Pick calendar week" : "Pick calendar month"}
        >
          <span>{label}</span>
          <Icon name="chevronDown" size={14} className="text-muted" />
        </button>
      }
    >
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between">
          {view === "week" ? (
            <button
              type="button"
              className="rounded-lg border border-line bg-white p-2 text-muted hover:bg-page hover:text-ink"
              aria-label="Previous year"
              onClick={() => setDisplayYear((value) => value - 1)}
            >
              <Icon name="chevronLeft" size={14} />
            </button>
          ) : (
            <Link
              href={hrefFor(year - 1, month)}
              className="rounded-lg border border-line bg-white p-2 text-muted hover:bg-page hover:text-ink"
              aria-label="Previous year"
            >
              <Icon name="chevronLeft" size={14} />
            </Link>
          )}
          <div className="text-center">
            <p className="text-sm font-extrabold">{view === "week" ? displayYear : year}</p>
            {view === "week" && (
              <p className="text-[11px] font-semibold text-muted">Pick a month, then a week</p>
            )}
          </div>
          {view === "week" ? (
            <button
              type="button"
              className="rounded-lg border border-line bg-white p-2 text-muted hover:bg-page hover:text-ink"
              aria-label="Next year"
              onClick={() => setDisplayYear((value) => value + 1)}
            >
              <Icon name="chevronRight" size={14} />
            </button>
          ) : (
            <Link
              href={hrefFor(year + 1, month)}
              className="rounded-lg border border-line bg-white p-2 text-muted hover:bg-page hover:text-ink"
              aria-label="Next year"
            >
              <Icon name="chevronRight" size={14} />
            </Link>
          )}
        </div>

        {view === "week" ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-page/70 p-1.5">
              {MONTHS.map((label, index) => {
                const value = index + 1;
                const active = value === displayMonth;
                return (
                  <button
                    key={label}
                    type="button"
                    className={`rounded-lg px-2 py-1.5 text-sm font-bold transition-colors ${
                      active
                        ? "bg-white text-primary-deep shadow-sm"
                        : "text-muted hover:bg-white hover:text-ink"
                    }`}
                    onClick={() => setDisplayMonth(value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                Weeks in {MONTHS[displayMonth - 1]}
              </p>
              {weeks.map((week) => (
                <Link
                  key={week.hrefDate}
                  href={hrefFor(week.year, week.month, week.day)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
                    week.active
                      ? "border-primary bg-primary-soft text-primary-deep"
                      : "border-line bg-white text-ink hover:bg-page"
                  }`}
                >
                  <span>{week.label}</span>
                  <span className="text-xs font-semibold text-muted">{week.shortLabel}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((label, index) => {
              const value = index + 1;
              const active = value === month;
              return (
                <Link
                  key={label}
                  href={hrefFor(year, value)}
                  className={`rounded-lg border px-3 py-2 text-center text-sm font-bold transition-colors ${
                    active
                      ? "border-primary bg-primary-soft text-primary-deep"
                      : "border-line bg-white text-muted hover:bg-page hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Dropdown>
  );
}

function weekOptions(
  displayYear: number,
  displayMonth: number,
  activeYear: number,
  activeMonth: number,
  activeDay: number
) {
  const active = weekStart(new Date(Date.UTC(activeYear, activeMonth - 1, activeDay, 12)));
  const first = new Date(Date.UTC(displayYear, displayMonth - 1, 1, 12));
  const last = new Date(Date.UTC(displayYear, displayMonth, 0, 12));
  let cursor = weekStart(first);
  const weeks: {
    year: number;
    month: number;
    day: number;
    hrefDate: string;
    label: string;
    shortLabel: string;
    active: boolean;
  }[] = [];

  while (cursor <= last) {
    const end = new Date(cursor.getTime() + 6 * 86400_000);
    weeks.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
      hrefDate: isoDate(cursor),
      label: `${formatWeekDate(cursor)} - ${formatWeekDate(end)}`,
      shortLabel: `Week of ${MONTHS[cursor.getUTCMonth()]} ${cursor.getUTCDate()}`,
      active: isoDate(cursor) === isoDate(active),
    });
    cursor = new Date(cursor.getTime() + 7 * 86400_000);
  }
  return weeks;
}

function weekStart(date: Date) {
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatWeekDate(date: Date) {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
