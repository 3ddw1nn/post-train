// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, nextNumericId, now } from "./model";

const postArgs = {
  id: v.string(),
  workspace_id: v.string(),
  created_by: v.string(),
  type: v.string(),
  caption: v.string(),
  status: v.string(),
  is_draft: v.number(),
  scheduled_at: v.union(v.string(), v.null()),
  used_queue: v.number(),
  queue_timezone: v.union(v.string(), v.null()),
  platform_configurations: v.union(v.string(), v.null()),
  account_configurations: v.union(v.string(), v.null()),
  free_credits_used: v.number(),
  media_ids: v.array(v.string()),
  destinations: v.array(v.object({ social_account_id: v.number(), caption_override: v.union(v.string(), v.null()) })),
};

export const getPost = query({
  args: { id: v.string() },
  handler: async (ctx, args) => await byLegacyId(ctx, "posts", args.id),
});

export const listPosts = query({
  args: {
    workspace_ids: v.array(v.string()),
    status: v.optional(v.string()),
    platform: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    let rows = (await Promise.all(
      args.workspace_ids.map((workspaceId) =>
        ctx.db
          .query("posts")
          .withIndex("by_workspace", (q) => q.eq("workspace_id", workspaceId))
          .collect()
      )
    )).flat();
    if (args.status) {
      const status = args.status === "published" ? "posted" : args.status;
      rows = rows.filter((p) => status === "draft" ? p.is_draft === 1 : p.status === status && p.is_draft === 0);
    }
    if (args.platform) {
      const matchingAccounts = await ctx.db.query("social_accounts").collect();
      const accountIds = new Set(matchingAccounts.filter((a) => a.platform === args.platform).map((a) => a.id));
      const dests = await ctx.db.query("post_destinations").collect();
      const postIds = new Set(dests.filter((d) => accountIds.has(d.social_account_id)).map((d) => d.post_id));
      rows = rows.filter((p) => postIds.has(p.id));
    }
    rows.sort((a, b) => (b.scheduled_at ?? b.created_at).localeCompare(a.scheduled_at ?? a.created_at));
    return { data: rows.slice(args.offset, args.offset + args.limit), count: rows.length };
  },
});

export const postsInRange = query({
  args: { workspace_id: v.string(), from: v.string(), to: v.string(), platform: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let rows = (await ctx.db
      .query("posts")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect()).filter((p) => {
      const when = p.scheduled_at ?? p.posted_at;
      return p.is_draft === 0 && !!when && when >= args.from && when < args.to;
    });
    if (args.platform) {
      const accounts = await ctx.db
        .query("social_accounts")
        .withIndex("by_workspace_platform", (q) =>
          q.eq("workspace_id", args.workspace_id).eq("platform", args.platform!)
        )
        .collect();
      const accountIds = new Set(accounts.map((a) => a.id));
      const dests = await ctx.db.query("post_destinations").collect();
      const postIds = new Set(dests.filter((d) => accountIds.has(d.social_account_id)).map((d) => d.post_id));
      rows = rows.filter((p) => postIds.has(p.id));
    }
    return rows.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  },
});

export const getMediaIds = query({
  args: { post_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("post_media")
      .withIndex("by_post", (q) => q.eq("post_id", args.post_id))
      .collect();
    return rows.sort((a, b) => a.sort_order - b.sort_order).map((r) => r.media_id);
  },
});

export const getAccountIds = query({
  args: { post_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("post_destinations")
      .withIndex("by_post", (q) => q.eq("post_id", args.post_id))
      .collect();
    return rows.map((r) => r.social_account_id);
  },
});

export const createPost = mutation({
  args: postArgs,
  handler: async (ctx, args) => {
    const ts = now();
    await ctx.db.insert("posts", {
      id: args.id,
      workspace_id: args.workspace_id,
      created_by: args.created_by,
      type: args.type,
      caption: args.caption,
      status: args.status,
      is_draft: args.is_draft,
      scheduled_at: args.scheduled_at,
      used_queue: args.used_queue,
      queue_timezone: args.queue_timezone,
      platform_configurations: args.platform_configurations,
      account_configurations: args.account_configurations,
      free_credits_used: args.free_credits_used,
      posted_at: null,
      created_at: ts,
      updated_at: ts,
    });
    for (const [index, mediaId] of args.media_ids.entries()) {
      await ctx.db.insert("post_media", { post_id: args.id, media_id: mediaId, sort_order: index });
    }
    let nextDestId = await nextNumericId(ctx, "post_destinations");
    for (const dest of args.destinations) {
      await ctx.db.insert("post_destinations", {
        id: nextDestId++,
        post_id: args.id,
        social_account_id: dest.social_account_id,
        caption_override: dest.caption_override,
        status: "pending",
      });
    }
    return await byLegacyId(ctx, "posts", args.id);
  },
});

export const patchPost = mutation({
  args: { id: v.string(), patch: v.any(), media_ids: v.optional(v.array(v.string())), destinations: v.optional(postArgs.destinations) },
  handler: async (ctx, args) => {
    const post = await byLegacyId(ctx, "posts", args.id);
    if (!post) return null;
    if (args.media_ids) {
      const existing = await ctx.db
        .query("post_media")
        .withIndex("by_post", (q) => q.eq("post_id", args.id))
        .collect();
      for (const row of existing) await ctx.db.delete(row._id);
      for (const [index, mediaId] of args.media_ids.entries()) {
        await ctx.db.insert("post_media", { post_id: args.id, media_id: mediaId, sort_order: index });
      }
    }
    if (args.destinations) {
      const existing = await ctx.db
        .query("post_destinations")
        .withIndex("by_post", (q) => q.eq("post_id", args.id))
        .collect();
      for (const row of existing) await ctx.db.delete(row._id);
      let nextDestId = await nextNumericId(ctx, "post_destinations");
      for (const dest of args.destinations) {
        await ctx.db.insert("post_destinations", {
          id: nextDestId++,
          post_id: args.id,
          social_account_id: dest.social_account_id,
          caption_override: dest.caption_override,
          status: "pending",
        });
      }
    }
    await ctx.db.patch(post._id, { ...args.patch, updated_at: now() });
    return await ctx.db.get(post._id);
  },
});

export const deletePost = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const post = await byLegacyId(ctx, "posts", args.id);
    if (!post) return false;
    for (const table of ["post_destinations", "post_media", "post_results"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_post", (q) => q.eq("post_id", args.id))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(post._id);
    return true;
  },
});
