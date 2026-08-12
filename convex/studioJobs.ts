// @ts-nocheck
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { ConvexError, v } from "convex/values";
import { byLegacyId, now } from "./model";
import { allowanceUsedSince, purchasedBalance, workspaceIdsForOwner } from "./credits";
import { writeNotification } from "./notifications";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const STUDIO_LABELS: Record<string, string> = {
  "fade-in": "Video Editor",
  "grid-2x2": "2x2 Grid Video",
  "ai-ugc": "AI UGC video",
  slideshow: "Slideshow",
};

const studioHref = (template: string) =>
  `/dashboard/content-studio/${template === "fade-in" ? "video-editor" : template}`;

async function updateRenderNotification(ctx: MutationCtx, job: Doc<"studio_jobs">) {
  const groupId = job.notification_group_id ?? job.id;
  const jobs = await ctx.db
    .query("studio_jobs")
    .withIndex("by_workspace_id_and_created_by_and_notification_group_id", (q) =>
      q.eq("workspace_id", job.workspace_id).eq("created_by", job.created_by).eq("notification_group_id", groupId),
    )
    .take(25);
  const groupJobs = jobs.length > 0 ? jobs : [job];
  const failed = groupJobs.find((item) => item.status === "failed");
  const allDone = groupJobs.every((item) => item.status === "done");
  const status = failed ? "failed" : allDone ? "done" : "processing";
  const label = STUDIO_LABELS[job.template] ?? "Studio render";
  // A multi-destination render is several jobs but one piece of work, so the
  // group — not the job — is the notification's identity.
  const count = groupJobs.length;
  const scope = count > 1 ? ` (${count} formats)` : "";
  await writeNotification(ctx, {
    user_id: job.created_by,
    workspace_id: job.workspace_id,
    dedupe_key: `studio-job:${groupId}`,
    type: "studio_render",
    status: status === "failed" ? "error" : status === "done" ? "success" : "processing",
    title:
      status === "failed"
        ? `${label} failed`
        : status === "done"
          ? `${label} is ready`
          : `${label} is rendering`,
    message:
      status === "failed"
        ? failed?.error_message || "The render could not be completed. Open Studio to try again."
        : status === "done"
          ? `Your export${scope} finished and is ready to preview.`
          : `Rendering${scope} — you can leave this page, it keeps going.`,
    href: studioHref(job.template),
  });
}

export const createJob = mutation({
  args: {
    id: v.string(),
    workspace_id: v.string(),
    created_by: v.string(),
    notification_group_id: v.string(),
    template: v.string(),
    params: v.string(),
    credits: v.optional(v.number()),
    // Metered templates pass these so the affordability check and the debit
    // happen in THIS transaction. Checking in the caller first would let two
    // concurrent renders both pass before either was recorded.
    owner_id: v.optional(v.string()),
    allowance: v.optional(v.number()),
    period_start: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner_id, allowance, period_start, ...jobFields } = args;
    const cost = args.credits ?? 0;

    let overflow = 0;
    if (cost > 0 && owner_id && period_start) {
      const cap = allowance ?? 0;
      const workspaceIds = await workspaceIdsForOwner(ctx, owner_id);
      // The workspace always counts, even if the owner lookup missed it, so a
      // stale membership can't hand out an unmetered render.
      if (!workspaceIds.includes(args.workspace_id)) workspaceIds.push(args.workspace_id);
      const allowanceUsed = await allowanceUsedSince(ctx, workspaceIds, period_start);
      const allowanceLeft = Math.max(0, cap - allowanceUsed);
      const purchased = await purchasedBalance(ctx, owner_id);
      if (cost > allowanceLeft + purchased) {
        throw new ConvexError({
          code: "studio_limit",
          needed: cost,
          allowance_left: allowanceLeft,
          purchased,
        });
      }
      overflow = Math.max(0, cost - allowanceLeft);
    }

    await ctx.db.insert("studio_jobs", {
      ...jobFields,
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
    // Only the part the allowance couldn't cover is charged to purchased
    // credits; the allowance side is derived from the job row just inserted.
    if (overflow > 0 && owner_id) {
      await ctx.db.insert("credit_ledger", {
        id: `cled_${args.id}`,
        user_id: owner_id,
        kind: "spend",
        credits: overflow,
        reason: "ai-ugc",
        ref_id: args.id,
        stripe_session_id: null,
        created_at: now(),
      });
    }
    const job = await byLegacyId(ctx, "studio_jobs", args.id);
    if (job) await updateRenderNotification(ctx, job);
    return job;
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
    const updated = await ctx.db.get(job._id);
    const nextStatus = typeof args.patch.status === "string" ? args.patch.status : job.status;
    if (updated && (nextStatus === "done" || nextStatus === "failed")) await updateRenderNotification(ctx, updated);
    return updated;
  },
});

// The Next.js API verifies the requesting user's workspace before calling
// this mutation. Keeping the workspace check here too prevents a stale or
// cross-workspace id from deleting another workspace's render history.
export const deleteForWorkspace = mutation({
  args: { id: v.string(), workspace_id: v.string() },
  handler: async (ctx, args) => {
    const job = await byLegacyId(ctx, "studio_jobs", args.id);
    if (!job || job.workspace_id !== args.workspace_id) return false;
    await ctx.db.delete(job._id);
    const groupId = job.notification_group_id ?? job.id;
    const siblings = await ctx.db
      .query("studio_jobs")
      .withIndex("by_workspace_id_and_created_by_and_notification_group_id", (q) =>
        q.eq("workspace_id", job.workspace_id).eq("created_by", job.created_by).eq("notification_group_id", groupId),
      )
      .take(2);
    const notification = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_dedupe_key", (q) =>
        q.eq("user_id", job.created_by).eq("dedupe_key", `studio-job:${groupId}`),
      )
      .unique();
    if (notification && siblings.length === 0) await ctx.db.delete(notification._id);
    return true;
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
    // Must outlast the longest render: runFfmpeg kills at 10 minutes
    // (lib/ffmpeg.ts), and a lease that expires first lets a second worker
    // claim a job that is still compositing and render it twice.
    const lease = new Date(Date.parse(args.now) + 12 * 60_000).toISOString();
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

/** Allowance credits spent this period across a set of workspaces. Thin
 *  wrapper so the read path and createJob's atomic check share one definition
 *  — see convex/credits.ts. */
export const creditsUsedSince = query({
  args: { workspace_ids: v.array(v.string()), template: v.string(), since: v.string() },
  handler: async (ctx, args) => allowanceUsedSince(ctx, args.workspace_ids, args.since),
});
