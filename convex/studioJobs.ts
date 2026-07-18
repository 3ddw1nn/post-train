// @ts-nocheck
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

export const createJob = mutation({
  args: {
    id: v.string(),
    workspace_id: v.string(),
    created_by: v.string(),
    template: v.string(),
    params: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("studio_jobs", {
      ...args,
      status: "queued",
      provider: null,
      provider_job_id: null,
      provider_video_url: null,
      output_media_id: null,
      error_message: null,
      attempts: 0,
      lease_until: null,
      created_at: now(),
      updated_at: now(),
    });
    return await byLegacyId(ctx, "studio_jobs", args.id);
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => await byLegacyId(ctx, "studio_jobs", args.id),
});

export const listForWorkspace = query({
  args: { workspace_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("studio_jobs")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .order("desc")
      .take(30);
    return rows;
  },
});

export const patchJob = mutation({
  args: { id: v.string(), patch: v.record(v.string(), v.any()) },
  handler: async (ctx, args) => {
    const job = await byLegacyId(ctx, "studio_jobs", args.id);
    if (!job) return null;
    await ctx.db.patch(job._id, { ...args.patch, updated_at: now() });
    return await ctx.db.get(job._id);
  },
});

/**
 * Atomically claim runnable jobs (queued, or generating awaiting a provider
 * poll) whose lease has expired. Convex OCC serializes concurrent claims, so
 * two worker processes can never take the same job.
 */
export const claimRunnable = mutation({
  args: { now: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const lease = new Date(Date.parse(args.now) + 5 * 60_000).toISOString();
    const claimed = [];
    for (const status of ["queued", "generating", "compositing"]) {
      const rows = await ctx.db
        .query("studio_jobs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(25);
      for (const row of rows) {
        if (claimed.length >= args.limit) break;
        if (row.lease_until && row.lease_until > args.now) continue;
        await ctx.db.patch(row._id, { lease_until: lease, updated_at: now() });
        claimed.push(await ctx.db.get(row._id));
      }
    }
    return claimed;
  },
});

/** AI generations used this month (failed jobs don't count against the cap). */
export const countMonthlySince = query({
  args: { workspace_id: v.string(), template: v.string(), since: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("studio_jobs")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .order("desc")
      .take(500);
    return rows.filter(
      (r) => r.template === args.template && r.created_at >= args.since && r.status !== "failed"
    ).length;
  },
});
