// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => await byLegacyId(ctx, "media", args.id),
});

export const getUploadedKinds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.ids.map((id) => byLegacyId(ctx, "media", id)));
    return rows.filter((r) => r && r.upload_status === "uploaded").map((r) => ({ id: r!.id, kind: r!.kind }));
  },
});

export const listForWorkspace = query({
  args: { workspace_id: v.string(), limit: v.number(), offset: v.number() },
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query("media")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("upload_status", "uploaded")
      )
      .collect()).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { data: rows.slice(args.offset, args.offset + args.limit), count: rows.length };
  },
});

export const createMedia = mutation({
  args: {
    id: v.string(),
    workspace_id: v.string(),
    name: v.string(),
    mime_type: v.string(),
    size_bytes: v.number(),
    kind: v.string(),
    upload_status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("media", {
      ...args,
      duration_s: null,
      width: null,
      height: null,
      created_at: now(),
    });
    return await byLegacyId(ctx, "media", args.id);
  },
});

export const markUploaded = mutation({
  args: { id: v.string(), size_bytes: v.number() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "media", args.id);
    if (!row) return null;
    await ctx.db.patch(row._id, { upload_status: "uploaded", size_bytes: args.size_bytes });
    return await ctx.db.get(row._id);
  },
});

export const deleteMedia = mutation({
  args: { workspace_id: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "media", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return false;
    const links = await ctx.db
      .query("post_media")
      .withIndex("by_media", (q) => q.eq("media_id", args.id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);
    await ctx.db.delete(row._id);
    return true;
  },
});
