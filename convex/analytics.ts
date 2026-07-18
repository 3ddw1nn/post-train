// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

export const listAnalytics = query({
  args: {
    workspace_id: v.string(),
    platform: v.optional(v.string()),
    since: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("analytics_records")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect();
    if (args.platform) rows = rows.filter((r) => r.platform === args.platform);
    if (args.since) rows = rows.filter((r) => !!r.platform_created_at && r.platform_created_at >= args.since!);
    rows.sort((a, b) => b.view_count - a.view_count);
    return { data: rows.slice(args.offset, args.offset + args.limit), count: rows.length };
  },
});

export const upsertRecord = mutation({
  args: {
    id: v.string(),
    post_result_id: v.string(),
    workspace_id: v.string(),
    platform: v.string(),
    platform_post_id: v.union(v.string(), v.null()),
    view_count: v.number(),
    like_count: v.number(),
    comment_count: v.number(),
    share_count: v.number(),
    cover_image_url: v.union(v.string(), v.null()),
    share_url: v.union(v.string(), v.null()),
    video_description: v.union(v.string(), v.null()),
    duration: v.union(v.number(), v.null()),
    platform_created_at: v.union(v.string(), v.null()),
    match_confidence: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("analytics_records")
      .withIndex("by_result", (q) => q.eq("post_result_id", args.post_result_id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, last_synced_at: now() });
      return await ctx.db.get(existing._id);
    }
    await ctx.db.insert("analytics_records", { ...args, last_synced_at: now() });
    return await byLegacyId(ctx, "analytics_records", args.id);
  },
});
