import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { listRecords } from "@/lib/db";
import { postsInRange, type PostRow } from "@/lib/posts";
import { formatInTz, wallTimeToUtc } from "@/lib/tz";
import { Icon } from "@/components/icons";
import { AccountAvatar } from "@/components/platform-icon";
import { PlatformFilter } from "./platform-filter";

export const metadata = { title: "Calendar" };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateKey(iso: string, tz: string): string {
  return formatInTz(iso, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function keyOf(d: Date, tz: string): string {
  return localDateKey(d.toISOString(), tz);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; platform?: string }>;
}) {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
  const tz = user.timezone || "UTC";

  // Anchor calendar date (in the user's tz)
  let ay: number, am: number, ad: number;
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    [ay, am, ad] = params.date.split("-").map(Number);
  } else {
    [ay, am, ad] = reorderUS(keyOf(new Date(), tz));
  }

  // Build the visible day grid (local dates)
  let days: { y: number; m: number; d: number }[] = [];
  let label: string;
  if (view === "month") {
    const first = new Date(Date.UTC(ay, am - 1, 1, 12));
    const firstDow = first.getUTCDay(); // Sunday-first
    const start = new Date(first.getTime() - firstDow * 86400_000);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * 86400_000);
      days.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
    }
    label = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  } else {
    const cur = new Date(Date.UTC(ay, am - 1, ad, 12));
    const start = new Date(cur.getTime() - cur.getUTCDay() * 86400_000);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + i * 86400_000);
      days.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });
    }
    const end = days[6];
    label = `${monthName(days[0].m)} ${days[0].d} – ${monthName(end.m)} ${end.d}`;
  }

  // Query posts across the visible range (converted from local wall time to UTC)
  const rangeStart = wallTimeToUtc(tz, days[0].y, days[0].m, days[0].d, 0, 0).toISOString();
  const last = days[days.length - 1];
  const rangeEnd = new Date(
    wallTimeToUtc(tz, last.y, last.m, last.d, 0, 0).getTime() + 86400_000
  ).toISOString();
  const posts = await postsInRange(ws.id, rangeStart, rangeEnd, params.platform || undefined);
  const [mediaLinks, mediaRows, destRows, accounts] = await Promise.all([
    listRecords<{ post_id: string; media_id: string; sort_order: number }>("post_media"),
    listRecords<{ id: string; kind: string }>("media"),
    listRecords<{ post_id: string; social_account_id: number }>("post_destinations"),
    listRecords<{ id: number; username: string; platform: string; avatar_url: string | null }>("social_accounts"),
  ]);

  const byDay = new Map<string, PostRow[]>();
  for (const p of posts) {
    const when = p.scheduled_at ?? p.posted_at;
    if (!when) continue;
    const key = localDateKey(when, tz);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  const todayKey = keyOf(new Date(), tz);

  // Prev/next navigation anchors
  const nav = (delta: number) => {
    if (view === "month") {
      const d = new Date(Date.UTC(ay, am - 1 + delta, 1, 12));
      return `/dashboard/posts/calendar?view=month&date=${fmtDate(d)}${platformQ(params.platform)}`;
    }
    const d = new Date(Date.UTC(ay, am - 1, ad + delta * 7, 12));
    return `/dashboard/posts/calendar?view=week&date=${fmtDate(d)}${platformQ(params.platform)}`;
  };

  return (
    <div className="fade-up">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted">
          Every scheduled and published post, in your local timezone.
        </p>
      </div>

      <div className="card mt-5 overflow-hidden">
        {/* Attached toolbar — navigation and filters live with the grid, not above it */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Link href={nav(-1)} className="btn-subtle !px-2 !py-1.5" aria-label="Previous">
              <Icon name="chevronLeft" size={16} />
            </Link>
            <span className="min-w-40 text-center font-bold">{label}</span>
            <Link href={nav(1)} className="btn-subtle !px-2 !py-1.5" aria-label="Next">
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <PlatformFilter value={params.platform ?? ""} />
            <div className="inline-flex rounded-[10px] border border-line bg-white p-0.5">
              {(["month", "week"] as const).map((v) => (
                <Link
                  key={v}
                  href={`/dashboard/posts/calendar?view=${v}&date=${params.date ?? fmtDate(new Date())}${platformQ(params.platform)}`}
                  className={`rounded-lg px-3 py-1 text-sm font-semibold capitalize ${
                    view === v ? "bg-primary text-primary-contrast" : "text-muted hover:text-ink"
                  }`}
                >
                  {v}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-line bg-page/50">
          {DAY_LABELS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-bold text-muted">
              {d}
            </div>
          ))}
        </div>
        <div className={`grid grid-cols-7 ${view === "month" ? "" : "min-h-[420px]"}`}>
          {days.map((day, i) => {
            const key = `${String(day.m).padStart(2, "0")}/${String(day.d).padStart(2, "0")}/${day.y}`;
            const dayPosts = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const muted = view === "month" && day.m !== am;
            const dateStr = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
            return (
              <div
                key={i}
                className={`group relative border-b border-r border-line p-1.5 ${
                  view === "month" ? "min-h-24" : "min-h-[420px]"
                } ${muted ? "bg-page/40" : "bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isToday ? "bg-primary text-primary-contrast" : muted ? "text-muted/60" : ""
                    }`}
                  >
                    {day.d}
                  </span>
                  <span className="hidden items-center gap-1 group-hover:flex">
                    {dayPosts[0] && (
                      <Link
                        href={`/dashboard/create/${dayPosts[0].id}`}
                        aria-label="Edit first post of this day"
                        className="rounded bg-page p-1 text-muted hover:text-ink"
                      >
                        <Icon name="pencil" size={11} />
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/create?date=${dateStr}`}
                      aria-label={`Create post on ${dateStr}`}
                      className="rounded bg-primary p-1 text-primary-contrast"
                    >
                      <Icon name="plus" size={11} strokeWidth={3} />
                    </Link>
                  </span>
                </div>
                {dayPosts.length === 0 ? (
                  view === "month" ? (
                    <p className="mt-2 text-center text-[10px] text-muted/50">No posts</p>
                  ) : (
                    <p className="mt-4 text-center text-xs text-muted/50">No posts</p>
                  )
                ) : (
                  <div className="mt-1 flex flex-col gap-1">
                    {dayPosts.slice(0, view === "month" ? 3 : 20).map((p) => {
                      const firstLink = mediaLinks
                        .filter((m) => m.post_id === p.id)
                        .sort((a, b) => a.sort_order - b.sort_order)[0];
                      const thumb = firstLink ? mediaRows.find((m) => m.id === firstLink.media_id) : undefined;
                      const firstDest = destRows.find((d) => d.post_id === p.id);
                      const dest = firstDest
                        ? accounts.find((a) => a.id === firstDest.social_account_id)
                        : undefined;
                      const when = p.scheduled_at ?? p.posted_at!;
                      return (
                        <Link
                          key={p.id}
                          href={`/dashboard/create/${p.id}`}
                          className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-1.5 py-1 text-[11px] shadow-sm transition-colors hover:border-primary"
                        >
                          {thumb &&
                            (thumb.kind === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/media-file/${thumb.id}`}
                                alt=""
                                className="h-6 w-6 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-page text-muted">
                                <Icon name={thumb.kind === "video" ? "video" : "file"} size={11} />
                              </span>
                            ))}
                          <span className="font-bold text-muted">
                            {formatInTz(when, tz, {
                              hour: user.pref_24h_time ? "2-digit" : "numeric",
                              minute: "2-digit",
                              hour12: !user.pref_24h_time,
                            })}
                          </span>
                          {dest && (
                            <AccountAvatar
                              username={dest.username}
                              platformId={dest.platform}
                              avatarUrl={dest.avatar_url}
                              size={16}
                            />
                          )}
                          <span className="truncate text-muted">{p.caption}</span>
                        </Link>
                      );
                    })}
                    {view === "month" && dayPosts.length > 3 && (
                      <p className="text-center text-[10px] font-semibold text-muted">
                        +{dayPosts.length - 3} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function platformQ(p?: string): string {
  return p ? `&platform=${p}` : "";
}
function monthName(m: number): string {
  return new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}
function reorderUS(us: string): [number, number, number] {
  // "MM/DD/YYYY" → [y, m, d]
  const [m, d, y] = us.split("/").map(Number);
  return [y, m, d];
}
