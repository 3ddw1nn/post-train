// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

export const getByHash = query({
  args: { key_hash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("api_keys")
      .withIndex("by_hash", (q) => q.eq("key_hash", args.key_hash))
      .unique();
    return row?.revoked_at ? null : row;
  },
});

export const listForWorkspace = query({
  args: { workspace_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("api_keys")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect();
  },
});

export const createApiKey = mutation({
  args: {
    id: v.string(),
    workspace_id: v.string(),
    name: v.string(),
    key_prefix: v.string(),
    key_hash: v.string(),
    last4: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("api_keys", { ...args, last_used_at: null, revoked_at: null, created_at: now() });
    return await byLegacyId(ctx, "api_keys", args.id);
  },
});

export const patchApiKey = mutation({
  args: { id: v.string(), patch: v.any() },
  handler: async (ctx, args) => {
    const key = await byLegacyId(ctx, "api_keys", args.id);
    if (!key) return null;
    await ctx.db.patch(key._id, args.patch);
    return await ctx.db.get(key._id);
  },
});
