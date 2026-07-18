// @ts-nocheck
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, nextNumericId, now } from "./model";

export const duePosts = query({
  args: { now: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_due", (q) =>
        q.eq("status", "scheduled").eq("is_draft", 0).lte("scheduled_at", args.now)
      )
      .take(args.limit);
    return rows.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  },
});

export const destinationsForPost = query({
  args: { post_id: v.string() },
  handler: async (ctx, args) => {
    const dests = await ctx.db
      .query("post_destinations")
      .withIndex("by_post", (q) => q.eq("post_id", args.post_id))
      .collect();
    const accounts = await Promise.all(
      dests.map(async (d) => {
        const account = await byLegacyId(ctx, "social_accounts", d.social_account_id);
        return account ? { ...account, dest_id: d.id } : null;
      })
    );
    return accounts.filter(Boolean);
  },
});

export const recordPublishResult = mutation({
  args: {
    id: v.string(),
    post_id: v.string(),
    social_account_id: v.number(),
    dest_id: v.number(),
    platform: v.string(),
    success: v.number(),
    platform_post_id: v.union(v.string(), v.null()),
    share_url: v.union(v.string(), v.null()),
    error_code: v.union(v.string(), v.null()),
    error_message: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("post_results", {
      id: args.id,
      post_id: args.post_id,
      social_account_id: args.social_account_id,
      platform: args.platform,
      success: args.success,
      platform_post_id: args.platform_post_id,
      share_url: args.share_url,
      error_code: args.error_code,
      error_message: args.error_message,
      completed_at: now(),
    });
    const dest = await byLegacyId(ctx, "post_destinations", args.dest_id);
    if (dest) await ctx.db.patch(dest._id, { status: args.success ? "success" : "failed" });
  },
});

export const patchPostStatus = mutation({
  args: { id: v.string(), status: v.string(), posted_at: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const post = await byLegacyId(ctx, "posts", args.id);
    if (!post) return null;
    await ctx.db.patch(post._id, { status: args.status, posted_at: args.posted_at, updated_at: now() });
    return await ctx.db.get(post._id);
  },
});

export const createWebhookDelivery = mutation({
  args: { id: v.string(), workspace_id: v.string(), event: v.string(), payload: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhook_deliveries", {
      ...args,
      status: "pending",
      attempts: 1,
      created_at: now(),
    });
  },
});

export const patchWebhookDelivery = mutation({
  args: { id: v.string(), status: v.string() },
  handler: async (ctx, args) => {
    const delivery = await byLegacyId(ctx, "webhook_deliveries", args.id);
    if (delivery) await ctx.db.patch(delivery._id, { status: args.status });
  },
});
