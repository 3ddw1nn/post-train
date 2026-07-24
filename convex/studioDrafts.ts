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

export const remove = mutation({
  args: { id: v.string(), workspace_id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "studio_drafts", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});
