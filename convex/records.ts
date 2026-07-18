// @ts-nocheck
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, nextNumericId, now } from "./model";

function matches(row: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, value]) => row[key] === value);
}

export const getByLegacyId = query({
  args: { table: v.string(), id: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => await byLegacyId(ctx, args.table, args.id),
});

export const findOne = query({
  args: { table: v.string(), filters: v.any() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).collect();
    return rows.find((row) => matches(row, args.filters)) ?? null;
  },
});

export const list = query({
  args: { table: v.string(), filters: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).collect();
    return args.filters ? rows.filter((row) => matches(row, args.filters)) : rows;
  },
});

export const count = query({
  args: { table: v.string(), filters: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).collect();
    return args.filters ? rows.filter((row) => matches(row, args.filters)).length : rows.length;
  },
});

export const insert = mutation({
  args: { table: v.string(), data: v.any() },
  handler: async (ctx, args) => await ctx.db.insert(args.table, args.data),
});

export const patchByLegacyId = mutation({
  args: { table: v.string(), id: v.union(v.string(), v.number()), patch: v.any() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, args.table, args.id);
    if (!row) return null;
    await ctx.db.patch(row._id, args.patch);
    return await ctx.db.get(row._id);
  },
});

export const patchWhere = mutation({
  args: { table: v.string(), filters: v.any(), patch: v.any() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).collect();
    const changed = [];
    for (const row of rows.filter((candidate) => matches(candidate, args.filters))) {
      await ctx.db.patch(row._id, args.patch);
      changed.push(row._id);
    }
    return changed.length;
  },
});

export const deleteByLegacyId = mutation({
  args: { table: v.string(), id: v.union(v.string(), v.number()) },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, args.table, args.id);
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

export const deleteWhere = mutation({
  args: { table: v.string(), filters: v.any() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).collect();
    let count = 0;
    for (const row of rows.filter((candidate) => matches(candidate, args.filters))) {
      await ctx.db.delete(row._id);
      count++;
    }
    return count;
  },
});

export const nextNumberId = query({
  args: { table: v.string() },
  handler: async (ctx, args) => await nextNumericId(ctx, args.table),
});

export const enqueueEmail = mutation({
  args: { id: v.string(), user_id: v.string(), kind: v.string(), subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("emails_outbox", { ...args, created_at: now() });
  },
});
