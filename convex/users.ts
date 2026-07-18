// @ts-nocheck
import { mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

export const createUser = mutation({
  args: {
    id: v.string(),
    email: v.string(),
    password_hash: v.union(v.string(), v.null()),
    display_name: v.string(),
    avatar_url: v.union(v.string(), v.null()),
    timezone: v.string(),
    workspace_id: v.string(),
    webhook_secret: v.string(),
  },
  handler: async (ctx, args) => {
    const ts = now();
    await ctx.db.insert("users", {
      id: args.id,
      email: args.email.toLowerCase().trim(),
      password_hash: args.password_hash,
      display_name: args.display_name,
      avatar_url: args.avatar_url,
      persona: null,
      onboarded_at: null,
      timezone: args.timezone,
      pref_24h_time: 0,
      pref_filename_caption: 0,
      pref_server_video_processing: 1,
      email_automation: 1,
      email_failure_alerts: 0,
      email_post_summary: 0,
      weekly_posting_goal: 3,
      free_posts_used: 0,
      upsell_dismissed: 0,
      first_subscribed_at: null,
      session_epoch: 0,
      created_at: ts,
    });
    await ctx.db.insert("workspaces", {
      id: args.workspace_id,
      owner_id: args.id,
      name: "Main",
      randomize_queue_time: 0,
      webhook_url: null,
      webhook_secret: args.webhook_secret,
      created_at: ts,
    });
    await ctx.db.insert("workspace_members", {
      workspace_id: args.workspace_id,
      user_id: args.id,
      role: "owner",
      created_at: ts,
    });
    await ctx.db.insert("queue_slots", {
      id: 1,
      workspace_id: args.workspace_id,
      time_local: "11:00",
      days: "1111100",
      created_at: ts,
    });
    await ctx.db.insert("queue_slots", {
      id: 2,
      workspace_id: args.workspace_id,
      time_local: "16:00",
      days: "1111100",
      created_at: ts,
    });
    return await byLegacyId(ctx, "users", args.id);
  },
});

export const patchUser = mutation({
  args: { id: v.string(), patch: v.any() },
  handler: async (ctx, args) => {
    const user = await byLegacyId(ctx, "users", args.id);
    if (!user) return null;
    await ctx.db.patch(user._id, args.patch);
    return await ctx.db.get(user._id);
  },
});

export const incrementSessionEpoch = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await byLegacyId(ctx, "users", args.id);
    if (user) await ctx.db.patch(user._id, { session_epoch: user.session_epoch + 1 });
  },
});
