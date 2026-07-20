// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, nextNumericId, now } from "./model";

export const listForUser = query({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("workspace_members")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .collect();
    const workspaces = await Promise.all(
      memberships.map((m) => byLegacyId(ctx, "workspaces", m.workspace_id))
    );
    return workspaces.filter(Boolean).sort((a, b) => a!.created_at.localeCompare(b!.created_at));
  },
});

export const isMember = query({
  args: { workspace_id: v.string(), user_id: v.string() },
  handler: async (ctx, args) => {
    return !!(await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("user_id", args.user_id)
      )
      .unique());
  },
});

export const createWorkspace = mutation({
  args: { id: v.string(), owner_id: v.string(), name: v.string(), webhook_secret: v.string() },
  handler: async (ctx, args) => {
    const ts = now();
    await ctx.db.insert("workspaces", {
      id: args.id,
      owner_id: args.owner_id,
      name: args.name,
      randomize_queue_time: 0,
      webhook_url: null,
      webhook_secret: args.webhook_secret,
      created_at: ts,
    });
    await ctx.db.insert("workspace_members", {
      workspace_id: args.id,
      user_id: args.owner_id,
      role: "owner",
      created_at: ts,
    });
    const nextSlot = await nextNumericId(ctx, "queue_slots");
    await ctx.db.insert("queue_slots", {
      id: nextSlot,
      workspace_id: args.id,
      time_local: "11:00",
      days: "1111100",
      created_at: ts,
    });
    await ctx.db.insert("queue_slots", {
      id: nextSlot + 1,
      workspace_id: args.id,
      time_local: "16:00",
      days: "1111100",
      created_at: ts,
    });
    return await byLegacyId(ctx, "workspaces", args.id);
  },
});

export const removeMember = mutation({
  args: { workspace_id: v.string(), user_id: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("user_id", args.user_id)
      )
      .unique();
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

export const changeRole = mutation({
  args: { workspace_id: v.string(), user_id: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("user_id", args.user_id)
      )
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, { role: args.role });
    return await ctx.db.get(row._id);
  },
});

/** Atomically hands ownership to another member: old owner becomes admin, target becomes owner. */
export const transferOwnership = mutation({
  args: { workspace_id: v.string(), from_user_id: v.string(), to_user_id: v.string() },
  handler: async (ctx, args) => {
    const [fromRow, toRow, workspace] = await Promise.all([
      ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspace_id", args.workspace_id).eq("user_id", args.from_user_id)
        )
        .unique(),
      ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspace_id", args.workspace_id).eq("user_id", args.to_user_id)
        )
        .unique(),
      byLegacyId(ctx, "workspaces", args.workspace_id),
    ]);
    if (!fromRow || !toRow || !workspace) return null;
    await ctx.db.patch(fromRow._id, { role: "admin" });
    await ctx.db.patch(toRow._id, { role: "owner" });
    await ctx.db.patch(workspace._id, { owner_id: args.to_user_id });
    return true;
  },
});

export const patchWorkspace = mutation({
  args: { id: v.string(), patch: v.any() },
  handler: async (ctx, args) => {
    const workspace = await byLegacyId(ctx, "workspaces", args.id);
    if (!workspace) return null;
    await ctx.db.patch(workspace._id, args.patch);
    return await ctx.db.get(workspace._id);
  },
});
