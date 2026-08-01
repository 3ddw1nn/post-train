// Shared display formatters. relativeTime used to be copy-pasted across
// grid-studio.tsx, slideshow-studio.tsx, ai-ugc-studio.tsx, and studio.tsx
// (as `draftAge`) with three subtly different implementations — one rounded
// instead of floored (so "30s ago" prematurely read "1m ago"), one had no
// "days" bucket at all (a draft from 3 days ago read "72h ago" forever), and
// capitalization varied. This is the floor-based version (the more correct
// of the three — accurate at each boundary, defensive against a future
// timestamp) with the lowercase "just now" three of the four call sites
// already used.
export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Shared "no scheduling into the past" helpers for every Publishing date/time
// pair (Content Studio's five wizards, Create Post) — previously only the
// Video Editor wizard enforced this, each with its own copy.

/** Today's date as an `<input type="date">` value, in local time. */
export function localDateInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 60+ seconds from now as an `<input type="time">` value, in local time. */
export function nextMinuteInputValue(date = new Date()): string {
  const next = new Date(date);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
}

/** The date input's `min` — normally the earliest selectable day, but
 *  relaxed down to an already-chosen earlier date so a stale hand-off value
 *  (e.g. picked in Content Studio, then shown minutes later on Create Post
 *  once render/finish finally completes) is still displayed instead of being
 *  silently blanked by the browser's native min-date enforcement. The
 *  existing "past schedule" banners already warn the user in that case. */
export function scheduleMinDate(date: string, earliestDate: string): string {
  return date && date < earliestDate ? date : earliestDate;
}

/** Same relaxation as `scheduleMinDate`, for the time input — only relevant
 *  when the date is the earliest selectable day, same as the existing
 *  same-day-only time floor. */
export function scheduleMinTime(date: string, time: string, earliestDate: string, earliestTime: string): string | undefined {
  if (date !== earliestDate) return undefined;
  return time && time < earliestTime ? time : earliestTime;
}

export function isPastSchedule(date: string, time: string, now = new Date()): boolean {
  const scheduled = new Date(`${date}T${time || "00:00"}`);
  return !Number.isNaN(scheduled.getTime()) && scheduled.getTime() < now.getTime();
}

/** Check if scheduled time is past today but same day (not a rejected future date). */
export function isPastToday(date: string, time: string, now = new Date()): boolean {
  if (!isPastSchedule(date, time, now)) return false;
  const todayDate = localDateInputValue(now);
  return date === todayDate;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
