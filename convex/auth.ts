// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId } from "./model";

export const findUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .unique();
  },
});

export const getUserById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => await byLegacyId(ctx, "users", args.id),
});

export const createPasswordReset = mutation({
  args: { token: v.string(), user_id: v.string(), expires_at: v.string() },
  handler: async (ctx, args) => await ctx.db.insert("password_resets", args),
});

export const getPasswordReset = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("password_resets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
  },
});

export const deletePasswordReset = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const reset = await ctx.db
      .query("password_resets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (reset) await ctx.db.delete(reset._id);
  },
});
