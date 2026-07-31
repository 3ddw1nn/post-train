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

export const setThumbnail = mutation({
  args: { workspace_id: v.string(), id: v.string(), thumbnail_media_id: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "media", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return null;
    await ctx.db.patch(row._id, { thumbnail_media_id: args.thumbnail_media_id });
    return await ctx.db.get(row._id);
  },
});

// A Content Studio "Finish" step — marks one or more media rows (one per
// finished output; Slideshow finishes several slides at once under a shared
// batch_id) as belonging in the Library. Silently skips ids that don't
// belong to this workspace rather than failing the whole batch.
export const markFinished = mutation({
  args: {
    workspace_id: v.string(),
    ids: v.array(v.string()),
    template: v.string(),
    batch_id: v.string(),
    campaign_name: v.union(v.string(), v.null()),
    platform_ids: v.array(v.string()),
    platform_captions: v.union(v.string(), v.null()),
    caption_brief: v.union(v.string(), v.null()),
    caption_length: v.union(v.string(), v.null()),
    output_metadata: v.array(v.object({
      media_id: v.string(),
      platform_id: v.string(),
      aspect_ratio: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const finished_at = now();
    for (const id of args.ids) {
      const row = await byLegacyId(ctx, "media", id);
      if (row && row.workspace_id === args.workspace_id) {
        const output = args.output_metadata.find((item) => item.media_id === id);
        await ctx.db.patch(row._id, {
          studio_template: args.template,
          studio_batch_id: args.batch_id,
          studio_finished_at: finished_at,
          studio_campaign_name: args.campaign_name,
          studio_platform_ids: args.platform_ids,
          studio_platform_captions: args.platform_captions,
          studio_caption_brief: args.caption_brief,
          studio_caption_length: args.caption_length,
          studio_platform_id: output?.platform_id ?? null,
          studio_aspect_ratio: output?.aspect_ratio ?? null,
        });
      }
    }
  },
});

// "Remove from Library" — clears the Finish marker only. The media row
// itself, and the file it points at, are untouched (same guarantee the old
// "My videos" list made about deleting a job never deleting the video).
export const clearFinished = mutation({
  args: { workspace_id: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "media", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return false;
    await ctx.db.patch(row._id, {
      studio_template: null,
      studio_batch_id: null,
      studio_finished_at: null,
      studio_campaign_name: null,
      studio_platform_ids: [],
      studio_platform_captions: null,
      studio_caption_brief: null,
      studio_caption_length: null,
      studio_platform_id: null,
      studio_aspect_ratio: null,
    });
    return true;
  },
});

export const listFinishedForWorkspace = query({
  args: { workspace_id: v.string(), template: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("media")
      .withIndex("by_workspace_template", (q) => q.eq("workspace_id", args.workspace_id).eq("studio_template", args.template))
      .collect();
    return rows
      .filter((r) => r.studio_finished_at)
      .sort((a, b) => (b.studio_finished_at as string).localeCompare(a.studio_finished_at as string));
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
