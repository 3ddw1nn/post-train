// @ts-nocheck
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
} from "convex/server";

type Ctx = { db: GenericDatabaseReader<GenericDataModel> | GenericDatabaseWriter<GenericDataModel> };
type WriteCtx = { db: GenericDatabaseWriter<GenericDataModel> };
type TableName = string;

export const now = () => new Date().toISOString();

export async function byLegacyId(ctx: Ctx, table: TableName, id: string | number) {
  return await ctx.db
    .query(table as never)
    .withIndex("by_legacy_id" as never, (q) => q.eq("id" as never, id as never))
    .unique();
}

export async function nextNumericId(ctx: Ctx, table: TableName) {
  const rows = await ctx.db.query(table as never).collect();
  return rows.reduce((max, row) => Math.max(max, Number((row as { id?: number }).id ?? 0)), 0) + 1;
}

export async function deleteByLegacyId(ctx: WriteCtx, table: TableName, id: string | number) {
  const doc = await byLegacyId(ctx, table, id);
  if (doc) await ctx.db.delete(doc._id);
  return !!doc;
}
