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
