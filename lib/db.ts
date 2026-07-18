import { mkdirSync } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

const convexGlobal = globalThis as unknown as { __ptConvex?: ConvexHttpClient };

export function getConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` or configure your Convex deployment.");
  }
  if (!convexGlobal.__ptConvex) {
    convexGlobal.__ptConvex = new ConvexHttpClient(url);
  }
  return convexGlobal.__ptConvex;
}

export async function convexQuery<T>(fn: unknown, args: Record<string, unknown> = {}) {
  return (await getConvexClient().query(fn as never, args as never)) as T;
}

export async function convexMutation<T>(fn: unknown, args: Record<string, unknown> = {}) {
  return (await getConvexClient().mutation(fn as never, args as never)) as T;
}

export async function recordById<T>(table: string, id: string | number): Promise<T | null> {
  return await convexQuery<T | null>(api.records.getByLegacyId, { table, id });
}

export async function findRecord<T>(
  table: string,
  filters: Record<string, unknown>
): Promise<T | null> {
  return await convexQuery<T | null>(api.records.findOne, { table, filters });
}

export async function listRecords<T>(
  table: string,
  filters?: Record<string, unknown>
): Promise<T[]> {
  return await convexQuery<T[]>(api.records.list, { table, ...(filters ? { filters } : {}) });
}

export async function insertRecord(table: string, data: Record<string, unknown>) {
  return await convexMutation(api.records.insert, { table, data });
}

export async function patchRecord<T>(
  table: string,
  id: string | number,
  patch: Record<string, unknown>
): Promise<T | null> {
  return await convexMutation<T | null>(api.records.patchByLegacyId, { table, id, patch });
}

export async function patchRecords(
  table: string,
  filters: Record<string, unknown>,
  patch: Record<string, unknown>
): Promise<number> {
  return await convexMutation<number>(api.records.patchWhere, { table, filters, patch });
}

export async function deleteRecord(table: string, id: string | number): Promise<boolean> {
  return await convexMutation<boolean>(api.records.deleteByLegacyId, { table, id });
}

export async function deleteRecords(
  table: string,
  filters: Record<string, unknown>
): Promise<number> {
  return await convexMutation<number>(api.records.deleteWhere, { table, filters });
}

export async function nextNumberId(table: string): Promise<number> {
  return await convexQuery<number>(api.records.nextNumberId, { table });
}

export function ensureMediaDir() {
  mkdirSync(MEDIA_DIR, { recursive: true });
}

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
