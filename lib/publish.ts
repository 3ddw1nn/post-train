// Publishing pipeline per spec 11 §5: fan-out per destination, independent
// success/failure, post ends `posted` if ≥1 destination succeeded else `failed`,
// then failure-alert/summary emails and a signed webhook.
//
// ponytail: the platform adapter below is a simulator — it exercises the full
// pipeline (results, share URLs, auth-failure paths) without real platform APIs.
// Upgrade path: replace `publishToPlatform` with real per-platform adapters
// behind the same signature (spec 10 §3 documents each platform API).
import { createHmac, randomBytes } from "node:crypto";
import { getDb, now, uid } from "./db";
import { platform as platformOf } from "./platforms";
import type { PostRow, SocialAccountRow } from "./posts";
import { queueEmail } from "./emails";

type PublishOutcome =
  | { success: true; platform_post_id: string; share_url: string }
  | { success: false; error_code: string; error_message: string };

function publishToPlatform(account: SocialAccountRow, _post: PostRow): PublishOutcome {
  if (account.status !== "active") {
    return {
      success: false,
      error_code: "auth_expired",
      error_message: `${platformOf(account.platform)?.name ?? account.platform} access token expired — reconnect this account.`,
    };
  }
  const platformPostId = randomBytes(9).toString("hex");
  const p = platformOf(account.platform);
  return {
    success: true,
    platform_post_id: platformPostId,
    share_url: p ? p.shareUrl(account.username, platformPostId) : "",
  };
}

export function publishPost(post: PostRow): void {
  const db = getDb();
  db.prepare("UPDATE posts SET status = 'processing', updated_at = ? WHERE id = ?").run(
    now(),
    post.id
  );
  const destinations = db
    .prepare(
      `SELECT a.*, d.id as dest_id FROM post_destinations d
       JOIN social_accounts a ON a.id = d.social_account_id WHERE d.post_id = ?`
    )
    .all(post.id) as (SocialAccountRow & { dest_id: number })[];

  const results: {
    platform: string;
    success: boolean;
    share_url?: string;
    error?: string;
  }[] = [];
  let anySuccess = false;
  const insert = db.prepare(
    `INSERT INTO post_results (id, post_id, social_account_id, platform, success,
      platform_post_id, share_url, error_code, error_message, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const markDest = db.prepare("UPDATE post_destinations SET status = ? WHERE id = ?");

  for (const account of destinations) {
    const outcome = publishToPlatform(account, post);
    insert.run(
      uid(),
      post.id,
      account.id,
      account.platform,
      outcome.success ? 1 : 0,
      outcome.success ? outcome.platform_post_id : null,
      outcome.success ? outcome.share_url : null,
      outcome.success ? null : outcome.error_code,
      outcome.success ? null : outcome.error_message,
      now()
    );
    markDest.run(outcome.success ? "success" : "failed", account.dest_id);
    if (outcome.success) anySuccess = true;
    results.push({
      platform: account.platform,
      success: outcome.success,
      ...(outcome.success
        ? { share_url: outcome.share_url }
        : { error: outcome.error_message }),
    });
  }

  const finalStatus = anySuccess ? "posted" : "failed";
  db.prepare(
    "UPDATE posts SET status = ?, posted_at = ?, updated_at = ? WHERE id = ?"
  ).run(finalStatus, now(), now(), post.id);

  // Emails per user preferences
  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(post.created_by) as {
    id: string;
    email_failure_alerts: number;
    email_post_summary: number;
  } | undefined;
  if (user) {
    if (user.email_failure_alerts) {
      for (const r of results.filter((r) => !r.success)) {
        queueEmail(
          user.id,
          "post_failure",
          `Post failed on ${r.platform}`,
          `Your post "${post.caption.slice(0, 60)}" failed on ${r.platform}: ${r.error}`
        );
      }
    }
    if (user.email_post_summary) {
      queueEmail(
        user.id,
        "post_summary",
        `Post summary: ${results.filter((r) => r.success).length}/${results.length} platforms succeeded`,
        results
          .map((r) => `${r.platform}: ${r.success ? `posted — ${r.share_url}` : `failed — ${r.error}`}`)
          .join("\n")
      );
    }
  }

  // Signed webhook (single URL per workspace, HMAC-SHA256)
  const ws = db
    .prepare("SELECT webhook_url, webhook_secret FROM workspaces WHERE id = ?")
    .get(post.workspace_id) as { webhook_url: string | null; webhook_secret: string };
  if (ws?.webhook_url) {
    const payload = JSON.stringify({ event: "post.completed", post_id: post.id, results });
    const signature = createHmac("sha256", ws.webhook_secret).update(payload).digest("hex");
    const deliveryId = uid();
    db.prepare(
      `INSERT INTO webhook_deliveries (id, workspace_id, event, payload, status, created_at)
       VALUES (?, ?, 'post.completed', ?, 'pending', ?)`
    ).run(deliveryId, post.workspace_id, payload, now());
    // ponytail: single attempt, no retry/backoff queue. Upgrade path: retries via
    // webhook_deliveries.attempts + next_retry_at scanning in the worker tick.
    fetch(ws.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": signature },
      body: payload,
    })
      .then((res) =>
        getDb()
          .prepare("UPDATE webhook_deliveries SET status = ? WHERE id = ?")
          .run(res.ok ? "delivered" : `failed_${res.status}`, deliveryId)
      )
      .catch(() =>
        getDb()
          .prepare("UPDATE webhook_deliveries SET status = 'failed_network' WHERE id = ?")
          .run(deliveryId)
      );
  }
}

/** Worker tick: publish everything due. */
export function processDuePosts(): number {
  const due = getDb()
    .prepare(
      `SELECT * FROM posts WHERE status = 'scheduled' AND is_draft = 0 AND scheduled_at <= ?
       ORDER BY scheduled_at LIMIT 25`
    )
    .all(now()) as PostRow[];
  for (const post of due) publishPost(post);
  return due.length;
}
