import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { listAnalytics } from "@/lib/analytics";
import { ANALYTICS_PLATFORMS, platform as platformOf } from "@/lib/platforms";
import { Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { DemoAnalytics, PreviewBanner } from "@/components/dashboard-preview";
import { SyncButton } from "./sync-button";

export const metadata = { title: "Analytics" };
const PREVIEW_PAYWALL_HREF = "/dashboard/settings/plans";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; timeframe?: string; platform?: string }>;
}) {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const params = await searchParams;
  const tab = params.tab === "posts" ? "posts" : "overview";
  const hasAccess = user.is_staff || analyticsAccess(sub);
  const ws = hasAccess ? await currentWorkspace(user) : null;
  const timeframe = (["7d", "30d", "90d", "all"].includes(params.timeframe ?? "")
    ? params.timeframe
    : "30d") as "7d" | "30d" | "90d" | "all";
  const { data } = ws
    ? await listAnalytics(ws.id, {
        timeframe,
        platform: params.platform || undefined,
        limit: 100,
      })
    : { data: [] };

  const totals = data.reduce(
    (t, r) => ({
      views: t.views + r.view_count,
      likes: t.likes + r.like_count,
      comments: t.comments + r.comment_count,
      shares: t.shares + r.share_count,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0 }
  );

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            Analytics <Pill tone="beta">Beta</Pill>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Views, likes, comments and shares — synced on demand.
          </p>
        </div>
        {hasAccess && <SyncButton />}
      </div>

      {!hasAccess && <PreviewBanner feature="analytics" />}

      {/* One toolbar: tabs and timeframe share the same rule */}
      <div className="mt-4 flex items-end justify-between gap-3 border-b border-line">
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ["overview", "Overview", "/dashboard/analytics"],
              ["posts", "Posts", "/dashboard/analytics?tab=posts"],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === key
                  ? "border-primary text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="mb-1.5 inline-flex shrink-0 rounded-[10px] border border-line bg-white p-0.5">
          {(["7d", "30d", "90d", "all"] as const).map((t) => (
            <Link
              key={t}
              href={hasAccess ? `/dashboard/analytics?tab=${tab}&timeframe=${t}` : PREVIEW_PAYWALL_HREF}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                timeframe === t ? "bg-primary text-primary-contrast" : "text-muted hover:text-ink"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      {!hasAccess ? (
        <DemoAnalytics tab={tab} />
      ) : tab === "overview" ? (
        <div className="card mt-6 overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
            {(
              [
                ["Views", totals.views, "eye"],
                ["Likes", totals.likes, "sparkles"],
                ["Comments", totals.comments, "chat"],
                ["Shares", totals.shares, "send"],
              ] as const
            ).map(([label, value, icon]) => (
              <div key={label} className="px-5 py-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-muted">
                  <Icon name={icon} size={13} /> {label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                  {fmt(value)}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-line px-5 py-4">
            <h2 className="font-bold">By platform</h2>
            <div className="mt-2 flex flex-col divide-y divide-line">
              {ANALYTICS_PLATFORMS.map((pid) => {
                const rows = data.filter((r) => r.platform === pid);
                const views = rows.reduce((s, r) => s + r.view_count, 0);
                return (
                  <div key={pid} className="flex items-center gap-3 py-3">
                    <PlatformIcon id={pid} size={20} />
                    <span className="font-semibold">{platformOf(pid)?.name}</span>
                    <span className="text-sm text-muted">{rows.length} tracked posts</span>
                    <span className="ml-auto font-bold tabular-nums">{fmt(views)} views</span>
                    <SyncButton platform={pid} />
                  </div>
                );
              })}
            </div>
            {data.length === 0 && (
              <p className="mt-4 text-sm text-muted">
                No analytics yet — publish to TikTok, YouTube or Instagram, then hit Sync.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="card mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold text-muted">
                <th className="px-4 py-3">Post</th>
                <th className="px-2 py-3">Platform</th>
                <th className="px-2 py-3 text-right">Views</th>
                <th className="px-2 py-3 text-right">Likes</th>
                <th className="px-2 py-3 text-right">Comments</th>
                <th className="px-2 py-3 text-right">Shares</th>
                <th className="px-2 py-3">Synced</th>
                <th className="px-2 py-3">Match</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted">
                    Nothing tracked in this window yet.
                  </td>
                </tr>
              )}
              {data.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="max-w-56 px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      {r.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.cover_image_url}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-page text-muted">
                          <Icon name="video" size={14} />
                        </span>
                      )}
                      <span className="truncate">{r.video_description || "—"}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <PlatformIcon id={r.platform} size={16} />
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold">{fmt(r.view_count)}</td>
                  <td className="px-2 py-2.5 text-right">{fmt(r.like_count)}</td>
                  <td className="px-2 py-2.5 text-right">{fmt(r.comment_count)}</td>
                  <td className="px-2 py-2.5 text-right">{fmt(r.share_count)}</td>
                  <td className="px-2 py-2.5 text-xs text-muted">
                    {r.last_synced_at ? new Date(r.last_synced_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-2 py-2.5">
                    <Pill tone="success">{r.match_confidence}</Pill>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.share_url && (
                      <a
                        href={r.share_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-deep"
                        aria-label="Open on platform"
                      >
                        <Icon name="external" size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
