"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Select, Toggle } from "@/components/interactive";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FALLBACK_TIMEZONES = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver",
  "America/Chicago", "America/New_York", "America/Toronto", "America/Sao_Paulo",
  "Atlantic/Reykjavik", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Athens",
  "Africa/Cairo", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo", "Australia/Perth", "Australia/Sydney",
  "Pacific/Auckland",
];

function availableTimezones() {
  try {
    const supportedValuesOf = (Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }).supportedValuesOf;
    return supportedValuesOf?.("timeZone") ?? FALLBACK_TIMEZONES;
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

function timezoneLabel(value: string) {
  try {
    const abbreviation = new Intl.DateTimeFormat(undefined, {
      timeZone: value,
      timeZoneName: "short",
    }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value;
    const place = value.replace(/_/g, " ").replace("/", " · ");
    return abbreviation ? `${place} (${abbreviation})` : place;
  } catch {
    return value;
  }
}

type Slot = { id: number; time: string; days: string };

function formatTime(hhmm: string, pref24h: boolean): string {
  if (pref24h) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function QueueEditor({
  slots,
  timezone,
  pref24h,
  randomize,
}: {
  slots: Slot[];
  timezone: string;
  pref24h: boolean;
  randomize: boolean;
}) {
  const router = useRouter();
  const [newTime, setNewTime] = useState("12:00");
  const [slotDays, setSlotDays] = useState(() =>
    Object.fromEntries(slots.map((slot) => [slot.id, slot.days])) as Record<number, string>
  );
  const [slotError, setSlotError] = useState<string | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const timezones = useMemo(
    () => [...new Set([timezone, ...availableTimezones()])].sort(),
    [timezone]
  );
  const timezoneOptions = useMemo(
    () => timezones.map((value) => ({ value, label: timezoneLabel(value) })),
    [timezones]
  );
  const activeCount = slots.reduce(
    (sum, s) => sum + [...s.days].filter((d) => d === "1").length,
    0
  );

  async function call(method: string, body: Record<string, unknown>) {
    const response = await fetch("/api/app/queue-slots", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error?.message ?? "Couldn't update the queue.");
    }
    router.refresh();
  }

  async function updateSlotDays(id: number, nextDays: string) {
    const previousDays = slotDays[id] ?? slots.find((slot) => slot.id === id)?.days;
    if (!previousDays) return;
    setSlotError(null);
    setSlotDays((current) => ({ ...current, [id]: nextDays }));
    try {
      await call("PATCH", { id, days: nextDays });
    } catch (error) {
      setSlotDays((current) => ({ ...current, [id]: previousDays }));
      setSlotError(error instanceof Error ? error.message : "Couldn't update the queue.");
    }
  }

  async function saveTimezone(nextTimezone: string) {
    setSelectedTimezone(nextTimezone);
    setSavingTimezone(true);
    setTimezoneError(null);
    const response = await fetch("/api/app/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: nextTimezone }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setSelectedTimezone(timezone);
      setTimezoneError(data?.error?.message ?? "Couldn't update the timezone.");
    } else {
      router.refresh();
    }
    setSavingTimezone(false);
  }

  function useCurrentTimezone() {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detectedTimezone) void saveTimezone(detectedTimezone);
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page/50 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold">Queue Schedule</h2>
          <p className="text-xs text-muted">
            {activeCount} slot{activeCount === 1 ? "" : "s"} per week · edits don&apos;t
            affect posts already scheduled
          </p>
        </div>
        <div className="flex min-w-[17rem] flex-col items-stretch sm:items-end">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-subtle whitespace-nowrap"
              disabled={savingTimezone}
              onClick={useCurrentTimezone}
            >
              Use current timezone
            </button>
            <Select
              value={selectedTimezone}
              onChange={(nextTimezone) => void saveTimezone(nextTimezone)}
              options={timezoneOptions}
              disabled={savingTimezone}
              width={360}
              align="right"
              ariaLabel="Queue timezone"
              ariaDescribedBy={timezoneError ? "queue-timezone-error" : "queue-timezone-help"}
              className="min-w-[17rem] !py-2 text-sm font-semibold"
            />
          </div>
          <p id="queue-timezone-help" className="mt-1 text-right text-[11px] font-medium text-muted">
            {savingTimezone ? "Saving…" : "Used for new queued posts"}
          </p>
          {timezoneError && <p id="queue-timezone-error" className="mt-1 text-right text-[11px] font-medium text-danger" role="alert">{timezoneError}</p>}
          <span className="sr-only" aria-live="polite">
            {timezoneError ?? (savingTimezone ? "Saving timezone" : "")}
          </span>
        </div>
      </div>

      <div className="p-5 pt-4">
        {slotError && (
          <p className="mb-3 text-sm font-semibold text-danger" role="alert">{slotError}</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-muted">
                <th className="pb-2 pr-2">Time</th>
                {DAYS.map((d) => (
                  <th key={d} className="pb-2 text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.id} className="border-t border-line">
                  <td className="py-2.5 pr-2">
                    <span className="flex items-center gap-2 font-semibold">
                      {formatTime(slot.time, pref24h)}
                      <button
                        type="button"
                        aria-label={`Remove ${slot.time} slot`}
                        className="text-muted hover:text-danger"
                        onClick={() => call("DELETE", { id: slot.id })}
                      >
                        <Icon name="x" size={13} strokeWidth={2.5} />
                      </button>
                    </span>
                  </td>
                  {DAYS.map((_, i) => {
                    const days = slotDays[slot.id] ?? slot.days;
                    const on = days[i] === "1";
                    return (
                      <td key={i} className="py-2.5 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`${DAYS[i]} at ${slot.time}`}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                            on
                              ? "border-primary bg-primary text-primary-contrast"
                              : "border-line bg-white text-transparent hover:border-primary/50"
                          }`}
                          onClick={() => {
                            const nextDays = [...days];
                            nextDays[i] = on ? "0" : "1";
                            void updateSlotDays(slot.id, nextDays.join(""));
                          }}
                        >
                          <Icon name="check" size={12} strokeWidth={3.5} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <label htmlFor="new-queue-time" className="text-sm font-bold">Add posting time</label>
              <p className="mt-1 text-xs text-muted">New times start on weekdays; choose additional days in the grid.</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <input
                id="new-queue-time"
                type="time"
                className="input min-w-0 flex-1 sm:w-40"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary shrink-0"
                onClick={() => newTime && call("POST", { time: newTime })}
              >
                <Icon name="plus" size={14} /> Add slot
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-line p-5">
        <div>
          <h2 className="text-sm font-bold">Randomize posting time</h2>
          <p className="mt-1 text-sm text-muted">
            Shift each queued post by up to ±10 minutes so your feed doesn&apos;t look
            scheduled to the minute.
          </p>
        </div>
        <Toggle
          on={randomize}
          endpoint="/api/app/workspace"
          field="randomize_queue_time"
          label="Randomize posting time"
        />
      </div>
    </section>
  );
}
