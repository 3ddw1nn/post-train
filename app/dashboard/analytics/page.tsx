import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { listAnalyticsEnriched } from "@/lib/analytics";
import { listRecords } from "@/lib/db";
import { DemoAnalytics, PreviewBanner } from "@/components/dashboard-preview";
import { AnalyticsView, type Row } from "./analytics-view";

export const metadata = { title: "Analytics" };

/** Posts that actually went live since Monday — the denominator for the
 *  weekly-goal meter on the Timing tab. */
function publishedThisWeek(posts: { status: string; posted_at: string | null }[]): number {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return posts.filter((p) => p.posted_at && new Date(p.posted_at) >= monday).length;
}

export default async function AnalyticsPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const hasAccess = user.is_staff || analyticsAccess(sub);

  if (!hasAccess) {
    return (
      <div className="fade-up">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            How your posts actually performed — views, engagement, timing and format.
          </p>
        </div>
        <PreviewBanner feature="analytics" />
        <DemoAnalytics tab="overview" />
      </div>
    );
  }

  const ws = await currentWorkspace(user);
  const [records, posts] = await Promise.all([
    listAnalyticsEnriched(ws.id),
    listRecords<{ status: string; posted_at: string | null }>("posts", { workspace_id: ws.id }),
  ]);

  const rows: Row[] = records.map((r) => ({
    id: r.id,
    platform: r.platform,
    view_count: r.view_count,
    like_count: r.like_count,
    comment_count: r.comment_count,
    share_count: r.share_count,
    cover_image_url: r.cover_image_url,
    share_url: r.share_url,
    video_description: r.video_description,
    duration: r.duration,
    platform_created_at: r.platform_created_at,
    last_synced_at: r.last_synced_at,
    match_confidence: r.match_confidence,
    post_type: r.post_type,
    studio_template: r.studio_template,
  }));

  return (
    <AnalyticsView
      rows={rows}
      weeklyGoal={user.weekly_posting_goal || 3}
      postedThisWeek={publishedThisWeek(posts)}
    />
  );
}
