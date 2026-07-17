// Queue scheduling engine per spec 11 §4: weekly slot grid, earliest free slot,
// ≤90-day scan, optional ±10 min jitter, timezone priority explicit > profile > UTC.
import { getDb } from "./db";

export type QueueSlot = {
  id: number;
  workspace_id: string;
  time_local: string; // "HH:MM"
  days: string; // 7 chars, Mon..Sun, '1' = active
  created_at: string;
};

import { datePartsInTz, wallTimeToUtc } from "./tz";

export class QueueError extends Error {
  constructor(public code: "no_schedule" | "no_slot_within_90_days", message: string) {
    super(message);
  }
}

export function slotsForWorkspace(workspaceId: string): QueueSlot[] {
  return getDb()
    .prepare("SELECT * FROM queue_slots WHERE workspace_id = ? ORDER BY time_local")
    .all(workspaceId) as QueueSlot[];
}

function slotOccupied(workspaceId: string, utc: Date): boolean {
  // A slot occurrence is taken if a scheduled/processing post sits within ±10 min
  // (covers jittered assignments too).
  const lo = new Date(utc.getTime() - 10 * 60000).toISOString();
  const hi = new Date(utc.getTime() + 10 * 60000).toISOString();
  return !!getDb()
    .prepare(
      `SELECT 1 FROM posts WHERE workspace_id = ? AND status IN ('scheduled','processing')
       AND is_draft = 0 AND scheduled_at > ? AND scheduled_at < ? LIMIT 1`
    )
    .get(workspaceId, lo, hi);
}

/** Earliest unoccupied slot after `after`, scanning up to 90 days. Throws QueueError. */
export function nextQueueSlot(workspaceId: string, tz: string, after = new Date()): Date {
  const slots = slotsForWorkspace(workspaceId);
  if (slots.length === 0) {
    throw new QueueError("no_schedule", "No queue schedule configured for this workspace.");
  }
  for (let offset = 0; offset <= 90; offset++) {
    const dayInstant = new Date(after.getTime() + offset * 86400_000);
    const { y, m, d, dowMon0 } = datePartsInTz(tz, dayInstant);
    for (const slot of slots) {
      if (slot.days[dowMon0] !== "1") continue;
      const [hh, mm] = slot.time_local.split(":").map(Number);
      const utc = wallTimeToUtc(tz, y, m, d, hh, mm);
      if (utc.getTime() <= after.getTime()) continue;
      if (slotOccupied(workspaceId, utc)) continue;
      return utc;
    }
  }
  throw new QueueError(
    "no_slot_within_90_days",
    "No free queue slot within the next 90 days."
  );
}

/** Apply ±10 min jitter when the workspace has randomize enabled. */
export function applyJitter(utc: Date, randomize: boolean): Date {
  if (!randomize) return utc;
  const jitterMs = Math.round((Math.random() * 20 - 10) * 60000);
  return new Date(utc.getTime() + jitterMs);
}
