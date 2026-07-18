import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { listAnalytics } from "@/lib/analytics";
import { ANALYTICS_PLATFORMS, platform as platformOf } from "@/lib/platforms";
import { Tabs, EmptyState, Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { SyncButton } from "./sync-button";

export const metadata = { title: "Analytics" };

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

  if (!analyticsAccess(sub)) {
    return (
      <div className="fade-up">
        <h1 className="text-2xl font-bold">
          Analytics <Pill tone="beta">Beta</Pill>
        </h1>
        <EmptyState
          icon="chart"
          title="Analytics requires Creator or Pro plan"
          subtitle="Track views, likes, comments and shares for your TikTok, YouTube and Instagram posts — synced on demand."
          cta={{ label: "View Plans", href: "/dashboard/settings/plans" }}
        />
      </div>
    );
  }

  const ws = await currentWorkspace(user);
  const timeframe = (["7d", "30d", "90d", "all"].includes(params.timeframe ?? "")
    ? params.timeframe
    : "30d") as "7d" | "30d" | "90d" | "all";
  const { data } = await listAnalytics(ws.id, {
    timeframe,
    platform: params.platform || undefined,
    limit: 100,
  });

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
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Analytics <Pill tone="beta">Beta</Pill>
        </h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-[10px] border border-line bg-white p-0.5">
            {(["7d", "30d", "90d", "all"] as const).map((t) => (
              <Link
                key={t}
                href={`/dashboard/analytics?tab=${tab}&timeframe=${t}`}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  timeframe === t ? "bg-primary text-primary-contrast" : "text-muted hover:text-ink"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
          <SyncButton />
        </div>
      </div>

      <div className="mt-4">
        <Tabs
          active={tab}
          tabs={[
            { key: "overview", label: "Overview", href: "/dashboard/analytics" },
            { key: "posts", label: "Posts", href: "/dashboard/analytics?tab=posts" },
          ]}
        />
      </div>

      {tab === "overview" ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                ["Views", totals.views, "eye"],
                ["Likes", totals.likes, "sparkles"],
                ["Comments", totals.comments, "chat"],
                ["Shares", totals.shares, "send"],
              ] as const
            ).map(([label, value, icon]) => (
              <div key={label} className="card p-5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                  <Icon name={icon} size={13} /> {label}
                </p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight">{fmt(value)}</p>
              </div>
            ))}
          </div>

          <div className="card mt-4 p-5">
            <h2 className="font-bold">By platform</h2>
            <div className="mt-3 flex flex-col divide-y divide-line">
              {ANALYTICS_PLATFORMS.map((pid) => {
                const rows = data.filter((r) => r.platform === pid);
                const views = rows.reduce((s, r) => s + r.view_count, 0);
                return (
                  <div key={pid} className="flex items-center gap-3 py-3">
                    <PlatformIcon id={pid} size={20} />
                    <span className="font-semibold">{platformOf(pid)?.name}</span>
                    <span className="text-sm text-muted">{rows.length} tracked posts</span>
                    <span className="ml-auto font-bold">{fmt(views)} views</span>
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
        </>
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
