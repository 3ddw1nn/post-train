// Analytics beta per spec §5.9: TikTok / YouTube / Instagram, on-demand sync.
// ponytail: metrics are simulated deterministically from the result id + post age
// (real impl pulls platform metric APIs per spec 10 §3); everything downstream —
// storage shape, timeframe filters, API responses — is the real contract.
import { createHash, randomBytes } from "node:crypto";
import { convexMutation, convexQuery, listRecords, uid } from "./db";
import { ANALYTICS_PLATFORMS } from "./platforms";
import { mediaFileUrl } from "./media";
import { api } from "@/convex/_generated/api";

export type AnalyticsRecord = {
  id: string;
  post_result_id: string;
  workspace_id: string;
  platform: string;
  platform_post_id: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  cover_image_url: string | null;
  share_url: string | null;
  video_description: string | null;
  duration: number | null;
  platform_created_at: string | null;
  last_synced_at: string | null;
  match_confidence: string;
};

function seededMetrics(seed: string, hoursLive: number) {
  const h = createHash("sha256").update(seed).digest();
  const rate = 40 + (h[0] << 8 | h[1]) % 2200; // views/hour baseline
  const views = Math.floor(rate * Math.pow(Math.max(hoursLive, 0.2), 0.85));
  return {
    views,
    likes: Math.floor(views * (0.02 + (h[2] % 60) / 1000)),
    comments: Math.floor(views * (0.002 + (h[3] % 8) / 1000)),
    shares: Math.floor(views * (0.004 + (h[4] % 10) / 1000)),
  };
}

export async function syncAnalytics(
  workspaceId: string,
  platformFilter?: string
): Promise<{ platform: string; runId: string }[]> {
  const platforms = platformFilter
    ? ANALYTICS_PLATFORMS.filter((p) => p === platformFilter)
    : ANALYTICS_PLATFORMS;
  const triggered: { platform: string; runId: string }[] = [];
  const posts = await listRecords<{ id: string; caption: string; posted_at: string | null; workspace_id: string }>(
    "posts",
    { workspace_id: workspaceId }
  );
  const results = await listRecords<{
    id: string;
    post_id: string;
    platform: string;
    platform_post_id: string | null;
    share_url: string | null;
    success: number;
  }>("post_results");
  const postMedia = await listRecords<{ post_id: string; media_id: string; sort_order: number }>("post_media");
  const media = await listRecords<{ id: string; kind: string; duration_s: number | null }>("media");
  for (const plat of platforms) {
    const rows = results
      .filter((r) => r.platform === plat && r.success === 1)
      .map((r) => {
        const post = posts.find((p) => p.id === r.post_id);
        if (!post) return null;
        const links = postMedia.filter((pm) => pm.post_id === post.id).sort((a, b) => a.sort_order - b.sort_order);
        const first_media = links[0]?.media_id ?? null;
        const video = links.map((l) => media.find((m) => m.id === l.media_id)).find((m) => m?.kind === "video");
        return { ...r, caption: post.caption, posted_at: post.posted_at, first_media, video_duration: video?.duration_s ?? null };
      })
      .filter(Boolean) as {
        id: string;
        platform: string;
        platform_post_id: string | null;
        share_url: string | null;
        caption: string;
        posted_at: string | null;
        first_media: string | null;
        video_duration: number | null;
      }[];
    for (const r of rows) {
      const hoursLive = r.posted_at
        ? (Date.now() - new Date(r.posted_at).getTime()) / 3600_000
        : 1;
      const m = seededMetrics(r.id, hoursLive);
      await convexMutation(api.analytics.upsertRecord, {
        id: uid(),
        post_result_id: r.id,
        workspace_id: workspaceId,
        platform: plat,
        platform_post_id: r.platform_post_id,
        view_count: m.views,
        like_count: m.likes,
        comment_count: m.comments,
        share_count: m.shares,
        cover_image_url: r.first_media ? mediaFileUrl(r.first_media) : null,
        share_url: r.share_url,
        video_description: r.caption.slice(0, 200) || null,
        duration: r.video_duration ? Math.round(r.video_duration) : null,
        platform_created_at: r.posted_at,
        match_confidence: "exact",
      });
    }
    triggered.push({ platform: plat, runId: `run_${randomBytes(8).toString("hex")}` });
  }
  return triggered;
}

export async function listAnalytics(
  workspaceId: string,
  opts: { platform?: string; timeframe?: "7d" | "30d" | "90d" | "all"; limit?: number; offset?: number } = {}
): Promise<{ data: AnalyticsRecord[]; count: number }> {
  let since: string | undefined;
  if (opts.timeframe && opts.timeframe !== "all") {
    const days = { "7d": 7, "30d": 30, "90d": 90 }[opts.timeframe];
    since = new Date(Date.now() - days * 86400_000).toISOString();
  }
  return await convexQuery<{ data: AnalyticsRecord[]; count: number }>(api.analytics.listAnalytics, {
    workspace_id: workspaceId,
    ...(opts.platform ? { platform: opts.platform } : {}),
    ...(since ? { since } : {}),
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
}
