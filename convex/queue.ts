// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, nextNumericId, now } from "./model";

export const slotsForWorkspace = query({
  args: { workspace_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("queue_slots")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect();
    return rows.sort((a, b) => a.time_local.localeCompare(b.time_local));
  },
});

export const slotOccupied = query({
  args: { workspace_id: v.string(), lo: v.string(), hi: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect();
    return rows.some(
      (p) =>
        ["scheduled", "processing"].includes(p.status) &&
        p.is_draft === 0 &&
        !!p.scheduled_at &&
        p.scheduled_at > args.lo &&
        p.scheduled_at < args.hi
    );
  },
});

export const upsertSlot = mutation({
  args: { workspace_id: v.string(), id: v.optional(v.number()), time_local: v.string(), days: v.string() },
  handler: async (ctx, args) => {
    const id = args.id ?? await nextNumericId(ctx, "queue_slots");
    const existing = await byLegacyId(ctx, "queue_slots", id);
    if (existing) {
      await ctx.db.patch(existing._id, { time_local: args.time_local, days: args.days });
      return await ctx.db.get(existing._id);
    }
    await ctx.db.insert("queue_slots", {
      id,
      workspace_id: args.workspace_id,
      time_local: args.time_local,
      days: args.days,
      created_at: now(),
    });
    return await byLegacyId(ctx, "queue_slots", id);
  },
});

export const deleteSlot = mutation({
  args: { workspace_id: v.string(), id: v.number() },
  handler: async (ctx, args) => {
    const slot = await byLegacyId(ctx, "queue_slots", args.id);
    if (!slot || slot.workspace_id !== args.workspace_id) return false;
    await ctx.db.delete(slot._id);
    return true;
  },
});
