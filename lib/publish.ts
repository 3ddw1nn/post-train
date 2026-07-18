// Publishing pipeline per spec 11 §5: fan-out per destination, independent
// success/failure, post ends `posted` if ≥1 destination succeeded else `failed`,
// then failure-alert/summary emails and a signed webhook.
//
// Bluesky publishes for real (lib/bluesky.ts). Other platforms are still
// simulated pending their OAuth apps — see TODO.md §1; each gets a real
// adapter behind the same PublishOutcome signature.
import { createHmac, randomBytes } from "node:crypto";
import { convexMutation, convexQuery, listRecords, now, uid } from "./db";
import { platform as platformOf } from "./platforms";
import type { PostRow, SocialAccountRow } from "./posts";
import { queueEmail } from "./emails";
import { decryptJson } from "./secretbox";
import { isBlueskyError, publishToBluesky, type BlueskyCredentials } from "./bluesky";
import { isTwitterError, publishToTwitter, type TwitterCredentials } from "./twitter";
import { isMastodonError, publishToMastodon, type MastodonCredentials } from "./mastodon";
import { isLinkedInError, publishToLinkedIn, type LinkedInCredentials } from "./linkedin";
import { encryptJson } from "./secretbox";
import { readMediaBytes } from "./media";
import { api } from "@/convex/_generated/api";

type PublishOutcome =
  | { success: true; platform_post_id: string; share_url: string }
  | { success: false; error_code: string; error_message: string };

type DestinationRow = SocialAccountRow & { dest_id: number; credentials?: string | null };

async function loadPostMedia(postId: string): Promise<{ bytes: Buffer; mime: string; kind: string }[]> {
  const mediaIds = await convexQuery<string[]>(api.posts.getMediaIds, { post_id: postId });
  const files = await Promise.all(mediaIds.map((id) => readMediaBytes(id)));
  return files
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .map((f) => ({ bytes: f.bytes, mime: f.row.mime_type, kind: f.row.kind }));
}

async function publishToPlatform(
  account: DestinationRow,
  post: PostRow,
  media: { bytes: Buffer; mime: string; kind: string }[]
): Promise<PublishOutcome> {
  if (account.status !== "active") {
    return {
      success: false,
      error_code: "auth_expired",
      error_message: `${platformOf(account.platform)?.name ?? account.platform} access token expired — reconnect this account.`,
    };
  }

  if (account.platform === "bluesky") {
    if (!account.credentials) {
      // Never let a real platform fall through to the simulator.
      await convexMutation(api.accounts.patchAccount, {
        id: account.id,
        patch: { status: "needs_reauth" },
      });
      return {
        success: false,
        error_code: "auth_expired",
        error_message: "Bluesky credentials missing — reconnect this account.",
      };
    }
    try {
      const creds = decryptJson<BlueskyCredentials>(account.credentials);
      const result = await publishToBluesky(creds, post.caption, media);
      return { success: true, ...result };
    } catch (e) {
      const code = isBlueskyError(e) ? e.code : "platform_error";
      if (code === "auth_expired") {
        await convexMutation(api.accounts.patchAccount, {
          id: account.id,
          patch: { status: "needs_reauth" },
        });
      }
      return {
        success: false,
        error_code: code,
        error_message: e instanceof Error ? e.message : "Bluesky publish failed.",
      };
    }
  }

  if (account.platform === "twitter") {
    if (!account.credentials) {
      await convexMutation(api.accounts.patchAccount, {
        id: account.id,
        patch: { status: "needs_reauth" },
      });
      return {
        success: false,
        error_code: "auth_expired",
        error_message: "Twitter credentials missing — reconnect this account.",
      };
    }
    try {
      const creds = decryptJson<TwitterCredentials>(account.credentials);
      const { result, refreshedCreds } = await publishToTwitter(creds, account.username, post.caption);
      if (refreshedCreds) {
        await convexMutation(api.accounts.patchAccount, {
          id: account.id,
          patch: { credentials: encryptJson(refreshedCreds) },
        });
      }
      return { success: true, ...result };
    } catch (e) {
      const code = isTwitterError(e) ? e.code : "platform_error";
      if (code === "auth_expired") {
        await convexMutation(api.accounts.patchAccount, {
          id: account.id,
          patch: { status: "needs_reauth" },
        });
      }
      return {
        success: false,
        error_code: code,
        error_message: e instanceof Error ? e.message : "Twitter publish failed.",
      };
    }
  }

  if (account.platform === "mastodon") {
    if (!account.credentials) {
      await convexMutation(api.accounts.patchAccount, {
        id: account.id,
        patch: { status: "needs_reauth" },
      });
      return {
        success: false,
        error_code: "auth_expired",
        error_message: "Mastodon credentials missing — reconnect this account.",
      };
    }
    try {
      const creds = decryptJson<MastodonCredentials>(account.credentials);
      const result = await publishToMastodon(creds, account.username, post.caption);
      return { success: true, ...result };
    } catch (e) {
      const code = isMastodonError(e) ? e.code : "platform_error";
      if (code === "auth_expired") {
        await convexMutation(api.accounts.patchAccount, {
          id: account.id,
          patch: { status: "needs_reauth" },
        });
      }
      return {
        success: false,
        error_code: code,
        error_message: e instanceof Error ? e.message : "Mastodon publish failed.",
      };
    }
  }

  if (account.platform === "linkedin") {
    if (!account.credentials || !account.platform_account_id) {
      await convexMutation(api.accounts.patchAccount, {
        id: account.id,
        patch: { status: "needs_reauth" },
      });
      return {
        success: false,
        error_code: "auth_expired",
        error_message: "LinkedIn credentials missing — reconnect this account.",
      };
    }
    try {
      const creds = decryptJson<LinkedInCredentials>(account.credentials);
      const result = await publishToLinkedIn(creds, account.platform_account_id, post.caption);
      return { success: true, ...result };
    } catch (e) {
      const code = isLinkedInError(e) ? e.code : "platform_error";
      if (code === "auth_expired") {
        await convexMutation(api.accounts.patchAccount, {
          id: account.id,
          patch: { status: "needs_reauth" },
        });
      }
      return {
        success: false,
        error_code: code,
        error_message: e instanceof Error ? e.message : "LinkedIn publish failed.",
      };
    }
  }

  // Simulated for platforms without a real adapter yet.
  const platformPostId = randomBytes(9).toString("hex");
  const p = platformOf(account.platform);
  return {
    success: true,
    platform_post_id: platformPostId,
    share_url: p ? p.shareUrl(account.username, platformPostId) : "",
  };
}

export async function publishPost(post: PostRow): Promise<void> {
  await convexMutation(api.publish.patchPostStatus, {
    id: post.id,
    status: "processing",
    posted_at: null,
  });
  const destinations = await convexQuery<DestinationRow[]>(
    api.publish.destinationsForPost,
    { post_id: post.id }
  );
  const needsMedia = destinations.some((d) => d.platform === "bluesky");
  const media = needsMedia ? await loadPostMedia(post.id) : [];

  const results: {
    platform: string;
    success: boolean;
    share_url?: string;
    error?: string;
  }[] = [];
  let anySuccess = false;
  for (const account of destinations) {
    const outcome = await publishToPlatform(account, post, media);
    await convexMutation(api.publish.recordPublishResult, {
      id: uid(),
      post_id: post.id,
      social_account_id: account.id,
      dest_id: account.dest_id,
      platform: account.platform,
      success: outcome.success ? 1 : 0,
      platform_post_id: outcome.success ? outcome.platform_post_id : null,
      share_url: outcome.success ? outcome.share_url : null,
      error_code: outcome.success ? null : outcome.error_code,
      error_message: outcome.success ? null : outcome.error_message,
    });
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
  await convexMutation(api.publish.patchPostStatus, {
    id: post.id,
    status: finalStatus,
    posted_at: now(),
  });

  // Emails per user preferences
  const user = await convexQuery<{
    id: string;
    email_failure_alerts: number;
    email_post_summary: number;
  } | null>(api.auth.getUserById, { id: post.created_by });
  if (user) {
    if (user.email_failure_alerts) {
      for (const r of results.filter((r) => !r.success)) {
        await queueEmail(
          user.id,
          "post_failure",
          `Post failed on ${r.platform}`,
          `Your post "${post.caption.slice(0, 60)}" failed on ${r.platform}: ${r.error}`
        );
      }
    }
    if (user.email_post_summary) {
      await queueEmail(
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
  const ws = await convexQuery<{ webhook_url: string | null; webhook_secret: string } | null>(
    api.records.getByLegacyId,
    { table: "workspaces", id: post.workspace_id }
  );
  if (ws?.webhook_url) {
    const payload = JSON.stringify({ event: "post.completed", post_id: post.id, results });
    const signature = createHmac("sha256", ws.webhook_secret).update(payload).digest("hex");
    const deliveryId = uid();
    await convexMutation(api.publish.createWebhookDelivery, {
      id: deliveryId,
      workspace_id: post.workspace_id,
      event: "post.completed",
      payload,
    });
    // ponytail: single attempt, no retry/backoff queue. Upgrade path: retries via
    // webhook_deliveries.attempts + next_retry_at scanning in the worker tick.
    fetch(ws.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": signature },
      body: payload,
    })
      .then((res) =>
        convexMutation(api.publish.patchWebhookDelivery, {
          id: deliveryId,
          status: res.ok ? "delivered" : `failed_${res.status}`,
        })
      )
      .catch(() =>
        convexMutation(api.publish.patchWebhookDelivery, {
          id: deliveryId,
          status: "failed_network",
        })
      );
  }
}

/** Worker tick: publish everything due. */
export async function processDuePosts(): Promise<number> {
  const due = await convexQuery<PostRow[]>(api.publish.duePosts, { now: now(), limit: 25 });
  for (const post of due) await publishPost(post);
  return due.length;
}
