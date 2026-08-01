// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

const GB = 1024 * 1024 * 1024;

async function workspaceStorageLimit() {
  // Storage is an entitlement of the workspace itself: plans and staff roles
  // never raise this cap.
  return GB;
}

async function storageBytes(ctx: any, workspaceId: string, excludeId?: string) {
  const rows = await ctx.db
    .query("media")
    .withIndex("by_workspace", (q: any) => q.eq("workspace_id", workspaceId))
    .take(5001);
  if (rows.length > 5000) return await workspaceStorageLimit();
  return rows
    .filter((row: any) => row.id !== excludeId && row.upload_status !== "failed")
    .reduce((total: number, row: any) => total + Math.max(0, row.size_bytes), 0);
}

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

// Storage accounting includes pending uploads so concurrent upload requests
// cannot reserve more than the workspace limit. Failed rows do not consume
// storage because they never produced a usable object.
export const storageUsage = query({
  args: { workspace_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("media")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .take(5001);
    const counted = rows.slice(0, 5000).filter((row) => row.upload_status !== "failed");
    return {
      bytes: counted.reduce((total, row) => total + Math.max(0, row.size_bytes), 0),
      count: counted.length,
      truncated: rows.length > 5000,
    };
  },
});

export const oldestForStorageCleanup = query({
  args: { workspace_id: v.string(), limit: v.number(), stale_pending_before: v.string() },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit)));
    const [uploaded, pending] = await Promise.all([
      ctx.db
        .query("media")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspace_id", args.workspace_id).eq("upload_status", "uploaded")
        )
        .order("asc")
        .take(limit),
      ctx.db
        .query("media")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspace_id", args.workspace_id).eq("upload_status", "pending")
        )
        .order("asc")
        .take(limit),
    ]);
    return [...uploaded, ...pending.filter((row) => row.created_at < args.stale_pending_before)]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
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
    const [used, limit] = await Promise.all([
      storageBytes(ctx, args.workspace_id),
      workspaceStorageLimit(),
    ]);
    if (used + Math.max(0, args.size_bytes) > limit) {
      throw new Error("STORAGE_LIMIT_REACHED");
    }
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
    const [used, limit] = await Promise.all([
      storageBytes(ctx, row.workspace_id, row.id),
      workspaceStorageLimit(),
    ]);
    if (used + Math.max(0, args.size_bytes) > limit) {
      throw new Error("STORAGE_LIMIT_REACHED");
    }
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
    draft_id: v.union(v.string(), v.null()),
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
          studio_draft_id: args.draft_id,
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

// Deletes only truly orphaned media after a post or Studio draft is removed.
// Media still used by another post, Studio draft/job, Library item, or video
// thumbnail is deliberately preserved.
export const removeIfUnreferenced = mutation({
  args: { workspace_id: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "media", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return null;
    if (row.studio_finished_at) return null;
    const postLinks = await ctx.db.query("post_media").withIndex("by_media", (q) => q.eq("media_id", args.id)).collect();
    if (postLinks.length > 0) return null;
    const [drafts, jobs, media] = await Promise.all([
      ctx.db.query("studio_drafts").withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id)).collect(),
      ctx.db.query("studio_jobs").collect(),
      ctx.db.query("media").withIndex("by_workspace_status", (q) => q.eq("workspace_id", args.workspace_id).eq("upload_status", "uploaded")).collect(),
    ]);
    if (drafts.some((draft) => draft.state.includes(args.id))) return null;
    if (jobs.some((job) => job.workspace_id === args.workspace_id && (job.output_media_id === args.id || job.output_media_ids?.includes(args.id) || job.params.includes(args.id)))) return null;
    if (media.some((candidate) => candidate.id !== args.id && candidate.thumbnail_media_id === args.id)) return null;
    await ctx.db.delete(row._id);
    return { id: row.id, kind: row.kind, name: row.name };
  },
});

// Used by quota cleanup and explicit permanent deletion from the Library.
// Published/scheduled posts, Studio drafts, source inputs, and thumbnails in
// use are protected. Completed job output references are derived history, so
// they are removed or updated alongside the file.
export const removeForStorageCleanup = mutation({
  args: { workspace_id: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "media", args.id);
    if (!row || row.workspace_id !== args.workspace_id) return null;

    const postLinks = await ctx.db
      .query("post_media")
      .withIndex("by_media", (q) => q.eq("media_id", args.id))
      .take(1);
    if (postLinks.length > 0) return null;

    const [drafts, jobs, media] = await Promise.all([
      ctx.db.query("studio_drafts").withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id)).take(5000),
      ctx.db.query("studio_jobs").withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id)).take(5000),
      ctx.db.query("media").withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id)).take(5000),
    ]);
    if (drafts.some((draft) => draft.state.includes(args.id))) return null;
    if (jobs.some((job) => job.params.includes(args.id))) return null;
    if (media.some((candidate) => candidate.id !== args.id && candidate.thumbnail_media_id === args.id)) return null;

    for (const job of jobs) {
      if (job.output_media_id === args.id) {
        await ctx.db.delete(job._id);
        continue;
      }
      if (!job.output_media_ids) continue;
      let outputIds: string[] = [];
      try {
        outputIds = JSON.parse(job.output_media_ids);
      } catch {
        outputIds = [];
      }
      if (!outputIds.includes(args.id)) continue;
      const remaining = outputIds.filter((id) => id !== args.id);
      if (remaining.length === 0) await ctx.db.delete(job._id);
      else await ctx.db.patch(job._id, { output_media_ids: JSON.stringify(remaining) });
    }

    await ctx.db.delete(row._id);
    return { id: row.id, kind: row.kind, name: row.name, size_bytes: row.size_bytes };
  },
});
