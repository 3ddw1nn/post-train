// Minimal IANA timezone math using Intl (no date library).

/** Minutes east of UTC for `tz` at instant `at`. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Convert a wall-clock time in `tz` to a UTC instant (2-pass for DST edges). */
export function wallTimeToUtc(
  tz: string,
  y: number,
  m: number, // 1-based month
  d: number,
  hh: number,
  mm: number
): Date {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMinutes(tz, new Date(guess));
    guess = Date.UTC(y, m - 1, d, hh, mm) - offset * 60000;
  }
  return new Date(guess);
}

/** Calendar date + weekday of instant `at` as seen in `tz`. dowMon0: Monday=0…Sunday=6. */
export function datePartsInTz(tz: string, at: Date): {
  y: number;
  m: number;
  d: number;
  dowMon0: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
  const dowMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { y: +parts.year, m: +parts.month, d: +parts.day, dowMon0: dowMap[parts.weekday] };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatInTz(
  iso: string | Date,
  tz: string,
  opts: Intl.DateTimeFormatOptions
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(d);
}
