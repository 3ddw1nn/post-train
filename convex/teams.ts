// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, nextNumericId, now } from "./model";

export const listForWorkspace = query({
  args: { workspace_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect();
  },
});

export const createTeam = mutation({
  args: { id: v.string(), name: v.string(), creator_id: v.string(), workspace_id: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("teams", { ...args, created_at: now() });
    return await byLegacyId(ctx, "teams", args.id);
  },
});

export const inviteMember = mutation({
  args: { team_id: v.string(), email_invited: v.string() },
  handler: async (ctx, args) => {
    const id = await nextNumericId(ctx, "team_members");
    await ctx.db.insert("team_members", {
      id,
      team_id: args.team_id,
      user_id: null,
      email_invited: args.email_invited,
      status: "invited",
      created_at: now(),
    });
    return await byLegacyId(ctx, "team_members", id);
  },
});

export const removeMember = mutation({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const member = await byLegacyId(ctx, "team_members", args.id);
    if (!member) return null;
    await ctx.db.patch(member._id, { status: "removed" });
    return await ctx.db.get(member._id);
  },
});

export const acceptInvite = mutation({
  args: { team_id: v.string(), user_id: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("team_members")
      .withIndex("by_team_email", (q) => q.eq("team_id", args.team_id).eq("email_invited", args.email))
      .unique();
    if (!invite) return null;
    await ctx.db.patch(invite._id, { user_id: args.user_id, status: "active" });
    return await ctx.db.get(invite._id);
  },
});
