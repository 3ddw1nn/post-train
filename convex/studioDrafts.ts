// @ts-nocheck
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

export const upsert = mutation({
  args: {
    id: v.string(),
    workspace_id: v.string(),
    created_by: v.string(),
    template: v.string(),
    mode: v.string(),
    source_platform: v.union(v.string(), v.null()),
    title: v.string(),
    cover_image_url: v.union(v.string(), v.null()),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await byLegacyId(ctx, "studio_drafts", args.id);
    if (existing) {
      if (existing.workspace_id !== args.workspace_id) throw new Error("Draft not found.");
      await ctx.db.patch(existing._id, { ...args, updated_at: now() });
      return await ctx.db.get(existing._id);
    }
    await ctx.db.insert("studio_drafts", { ...args, created_at: now(), updated_at: now() });
    return await byLegacyId(ctx, "studio_drafts", args.id);
  },
});

export const listForWorkspace = query({
  args: { workspace_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studio_drafts")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .order("desc")
      .take(30);
  },
});

export const setStatus = mutation({
  args: {
    id: v.string(),
    workspace_id: v.string(),
    status: v.string(),
    finished_media_ids: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "studio_drafts", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return null;
    // An editor opened from an older draft may not have its output ids in
    // memory. In that case retain the ids recorded when it was finished.
    const finishedMediaIds = args.finished_media_ids?.length
      ? args.finished_media_ids
      : row.finished_media_ids ?? [];
    if (args.status === "drafting") {
      for (const mediaId of finishedMediaIds) {
        const media = await byLegacyId(ctx, "media", mediaId);
        if (!media || media.workspace_id !== args.workspace_id) continue;
        await ctx.db.patch(media._id, {
          studio_template: null,
          studio_batch_id: null,
          studio_draft_id: null,
          studio_finished_at: null,
          studio_campaign_name: null,
          studio_platform_ids: [],
          studio_platform_captions: null,
          studio_caption_brief: null,
          studio_caption_length: null,
          studio_platform_id: null,
          studio_aspect_ratio: null,
        });
      }
    }
    await ctx.db.patch(row._id, {
      status: args.status,
      finished_media_ids: args.status === "finished" ? finishedMediaIds : [],
      updated_at: now(),
    });
    return await ctx.db.get(row._id);
  },
});

export const remove = mutation({
  args: { id: v.string(), workspace_id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "studio_drafts", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return null;
    const mediaIds = [...new Set((row.state.match(/\bmid_[a-z0-9]+\b/gi) ?? []))];
    await ctx.db.delete(row._id);
    return { media_ids: mediaIds };
  },
});
