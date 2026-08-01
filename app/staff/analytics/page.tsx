import { requireStaffUser } from "@/lib/auth";
import { listRecords } from "@/lib/db";
import { Icon } from "@/components/icons";
import { TrendChart, PlanMixBars } from "@/components/staff-charts";

export const metadata = { title: "Staff — Analytics" };

type UserRow = { id: string; created_at: string };
type WorkspaceRow = { id: string; created_at: string };
type PostRow = { id: string; status: string; is_draft: number; posted_at: string | null; created_at: string };
type SubscriptionRow = { id: string; user_id: string; plan: string; status: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;

function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY_MS);
}

// ponytail: naive full-table scan/bucket — fine at this volume, matches the
// scan-and-filter pattern already used by the other staff pages.
function bucketByDay(dates: (string | null)[], days: number): { date: string; count: number }[] {
  const start = daysAgo(days - 1);
  start.setHours(0, 0, 0, 0);
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    buckets.set(new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const iso of dates) {
    const key = iso?.slice(0, 10);
    if (key && buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase text-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

export default async function StaffAnalyticsPage() {
  await requireStaffUser();
  const [users, workspaces, posts, subscriptions] = await Promise.all([
    listRecords<UserRow>("users"),
    listRecords<WorkspaceRow>("workspaces"),
    listRecords<PostRow>("posts"),
    listRecords<SubscriptionRow>("subscriptions"),
  ]);

  const publishedPosts = posts.filter((p) => p.status === "posted" && p.is_draft === 0);
  const activeSubs = subscriptions.filter((s) => s.status === "active" || s.status === "trialing");
  const payingUserIds = new Set(activeSubs.map((s) => s.user_id));

  const since30 = daysAgo(TREND_DAYS).toISOString();
  const newUsers30d = users.filter((u) => u.created_at >= since30).length;
  const newWorkspaces30d = workspaces.filter((w) => w.created_at >= since30).length;
  const posts30d = publishedPosts.filter((p) => (p.posted_at ?? p.created_at) >= since30).length;

  const signupTrend = bucketByDay(users.map((u) => u.created_at), TREND_DAYS);
  const postTrend = bucketByDay(publishedPosts.map((p) => p.posted_at ?? p.created_at), TREND_DAYS);

  const planCounts = new Map<string, number>();
  for (const s of activeSubs) planCounts.set(s.plan, (planCounts.get(s.plan) ?? 0) + 1);
  planCounts.set("free", users.length - payingUserIds.size);

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="users" label="Total users" value={users.length} />
        <StatTile icon="folder" label="Total workspaces" value={workspaces.length} />
        <StatTile icon="send" label="Posts published" value={publishedPosts.length} />
        <StatTile icon="card" label="Paying subscriptions" value={activeSubs.length} />
      </div>

      <div className="mt-6 flex items-center gap-1.5">
        <Icon name="calendar" size={12} className="text-muted" />
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Last {TREND_DAYS} days</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon="users" label="New users" value={newUsers30d} />
        <StatTile icon="folder" label="New workspaces" value={newWorkspaces30d} />
        <StatTile icon="send" label="Posts published" value={posts30d} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase text-muted">Signups per day</p>
          <TrendChart data={signupTrend} />
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase text-muted">Posts published per day</p>
          <TrendChart data={postTrend} />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-1.5">
        <Icon name="chart" size={12} className="text-muted" />
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Plan mix</p>
      </div>
      <div className="card mt-2 p-4">
        <PlanMixBars counts={planCounts} total={users.length} />
      </div>
    </div>
  );
}
