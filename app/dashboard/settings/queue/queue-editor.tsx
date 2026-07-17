"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Toggle } from "@/components/interactive";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const activeCount = slots.reduce(
    (sum, s) => sum + [...s.days].filter((d) => d === "1").length,
    0
  );

  async function call(method: string, body: Record<string, unknown>) {
    await fetch("/api/app/queue-slots", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <h2 className="font-bold">Queue Schedule</h2>
        <p className="mt-1 text-sm text-muted">
          You have {activeCount} slot{activeCount === 1 ? "" : "s"} to post during your
          week.
        </p>
        <p className="text-xs text-muted">
          Editing your schedule here won&apos;t affect posts that are already scheduled.
        </p>
        <p className="mt-2 text-xs font-semibold text-muted">
          Timezone: <span className="text-ink">{timezone}</span>
        </p>

        <div className="mt-4 overflow-x-auto">
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
                    const on = slot.days[i] === "1";
                    return (
                      <td key={i} className="py-2.5 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`${DAYS[i]} at ${slot.time}`}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                            on
                              ? "border-primary bg-primary text-[#0c2e1a]"
                              : "border-line bg-white text-transparent hover:border-primary/50"
                          }`}
                          onClick={() => {
                            const days = [...slot.days];
                            days[i] = on ? "0" : "1";
                            call("PATCH", { id: slot.id, days: days.join("") });
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

        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
          <Icon name="clock" size={15} className="text-muted" />
          <input
            type="time"
            className="input w-36"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            aria-label="New slot time"
          />
          <button
            className="btn-subtle"
            onClick={() => newTime && call("POST", { time: newTime })}
          >
            <Icon name="plus" size={14} /> Add time
          </button>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">Randomize posting time</h2>
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
    </div>
  );
}
