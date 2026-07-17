// Analytics beta per spec §5.9: TikTok / YouTube / Instagram, on-demand sync.
// ponytail: metrics are simulated deterministically from the result id + post age
// (real impl pulls platform metric APIs per spec 10 §3); everything downstream —
// storage shape, timeframe filters, API responses — is the real contract.
import { createHash, randomBytes } from "node:crypto";
import { getDb, now, uid } from "./db";
import { ANALYTICS_PLATFORMS } from "./platforms";
import { mediaFileUrl } from "./media";

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

export function syncAnalytics(
  workspaceId: string,
  platformFilter?: string
): { platform: string; runId: string }[] {
  const db = getDb();
  const platforms = platformFilter
    ? ANALYTICS_PLATFORMS.filter((p) => p === platformFilter)
    : ANALYTICS_PLATFORMS;
  const triggered: { platform: string; runId: string }[] = [];
  for (const plat of platforms) {
    const results = db
      .prepare(
        `SELECT r.*, p.caption, p.posted_at, p.workspace_id,
           (SELECT media_id FROM post_media pm WHERE pm.post_id = p.id ORDER BY sort_order LIMIT 1) AS first_media,
           (SELECT duration_s FROM media m JOIN post_media pm2 ON pm2.media_id = m.id
              WHERE pm2.post_id = p.id AND m.kind = 'video' LIMIT 1) AS video_duration
         FROM post_results r JOIN posts p ON p.id = r.post_id
         WHERE p.workspace_id = ? AND r.platform = ? AND r.success = 1`
      )
      .all(workspaceId, plat) as {
      id: string;
      platform: string;
      platform_post_id: string | null;
      share_url: string | null;
      caption: string;
      posted_at: string | null;
      first_media: string | null;
      video_duration: number | null;
    }[];
    for (const r of results) {
      const hoursLive = r.posted_at
        ? (Date.now() - new Date(r.posted_at).getTime()) / 3600_000
        : 1;
      const m = seededMetrics(r.id, hoursLive);
      db.prepare(
        `INSERT INTO analytics_records (id, post_result_id, workspace_id, platform, platform_post_id,
           view_count, like_count, comment_count, share_count, cover_image_url, share_url,
           video_description, duration, platform_created_at, last_synced_at, match_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'exact')
         ON CONFLICT(post_result_id) DO UPDATE SET
           view_count = excluded.view_count, like_count = excluded.like_count,
           comment_count = excluded.comment_count, share_count = excluded.share_count,
           last_synced_at = excluded.last_synced_at`
      ).run(
        uid(),
        r.id,
        workspaceId,
        plat,
        r.platform_post_id,
        m.views,
        m.likes,
        m.comments,
        m.shares,
        r.first_media ? mediaFileUrl(r.first_media) : null,
        r.share_url,
        r.caption.slice(0, 200) || null,
        r.video_duration ? Math.round(r.video_duration) : null,
        r.posted_at,
        now()
      );
    }
    triggered.push({ platform: plat, runId: `run_${randomBytes(8).toString("hex")}` });
  }
  return triggered;
}

export function listAnalytics(
  workspaceId: string,
  opts: { platform?: string; timeframe?: "7d" | "30d" | "90d" | "all"; limit?: number; offset?: number } = {}
): { data: AnalyticsRecord[]; count: number } {
  const db = getDb();
  const where: string[] = ["workspace_id = ?"];
  const params: (string | number)[] = [workspaceId];
  if (opts.platform) {
    where.push("platform = ?");
    params.push(opts.platform);
  }
  if (opts.timeframe && opts.timeframe !== "all") {
    const days = { "7d": 7, "30d": 30, "90d": 90 }[opts.timeframe];
    where.push("platform_created_at >= ?");
    params.push(new Date(Date.now() - days * 86400_000).toISOString());
  }
  const whereSql = where.join(" AND ");
  const count = (
    db.prepare(`SELECT COUNT(*) c FROM analytics_records WHERE ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;
  const data = db
    .prepare(
      `SELECT * FROM analytics_records WHERE ${whereSql} ORDER BY view_count DESC LIMIT ? OFFSET ?`
    )
    .all(...params, opts.limit ?? 50, opts.offset ?? 0) as AnalyticsRecord[];
  return { data, count };
}
