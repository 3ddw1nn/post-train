// @ts-nocheck
// AI credit accounting. Two buckets fund a render:
//
//   1. the monthly plan allowance, derived by summing studio_jobs.credits since
//      the period start (so pre-ledger history still counts, and a failed job
//      is automatically free), and
//   2. purchased credits, an append-only balance in credit_ledger that does
//      not reset each month.
//
// Allowance is spent first. Only the overflow touches purchased credits, and
// only that overflow writes a ledger "spend" row — which is why the two
// buckets can coexist without double-counting.
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

/** Credits already drawn from the monthly allowance, across every workspace
 *  the subscriber owns. Failed renders are free; rows predating metering count
 *  as 1 rather than 0 so history can't be replayed for free. */
export async function allowanceUsedSince(ctx, workspaceIds: string[], since: string) {
  let used = 0;
  for (const workspaceId of workspaceIds) {
    const rows = await ctx.db
      .query("studio_jobs")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", workspaceId))
      .order("desc")
      .filter((q) => q.eq(q.field("template"), "ai-ugc"))
      .take(500);
    for (const row of rows) {
      if (row.created_at < since || row.status === "failed") continue;
      used += typeof row.credits === "number" ? row.credits : 1;
    }
  }
  return used;
}

/** Purchased credits still available: everything bought, less the overflow
 *  spends already charged against it. Never expires. */
export async function purchasedBalance(ctx, userId: string) {
  const rows = await ctx.db
    .query("credit_ledger")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .collect();
  let balance = 0;
  for (const row of rows) {
    if (row.kind === "purchase" || row.kind === "refund") balance += row.credits;
    else if (row.kind === "spend") balance -= row.credits;
  }
  return Math.max(0, balance);
}

export async function workspaceIdsForOwner(ctx, ownerId: string) {
  const rows = await ctx.db
    .query("workspaces")
    .withIndex("by_owner", (q) => q.eq("owner_id", ownerId))
    .collect();
  return rows.map((r) => r.id);
}

/** Read-only view for the wizard: what's left, and where it comes from. */
export const balanceForOwner = query({
  args: { owner_id: v.string(), allowance: v.number(), since: v.string() },
  handler: async (ctx, args) => {
    const workspaceIds = await workspaceIdsForOwner(ctx, args.owner_id);
    const [allowanceUsed, purchased] = [
      await allowanceUsedSince(ctx, workspaceIds, args.since),
      await purchasedBalance(ctx, args.owner_id),
    ];
    return {
      allowance_used: allowanceUsed,
      allowance: args.allowance,
      purchased,
    };
  },
});

/**
 * Grant purchased credits. Idempotent on stripe_session_id because Stripe
 * retries webhook deliveries — a second delivery must not grant twice.
 */
export const grantPurchase = mutation({
  args: {
    id: v.string(),
    user_id: v.string(),
    credits: v.number(),
    reason: v.string(),
    ref_id: v.union(v.string(), v.null()),
    stripe_session_id: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    if (args.stripe_session_id) {
      const existing = await ctx.db
        .query("credit_ledger")
        .withIndex("by_stripe_session", (q) => q.eq("stripe_session_id", args.stripe_session_id))
        .first();
      if (existing) return { granted: false, duplicate: true };
    }
    await ctx.db.insert("credit_ledger", {
      id: args.id,
      user_id: args.user_id,
      kind: "purchase",
      credits: args.credits,
      reason: args.reason,
      ref_id: args.ref_id,
      stripe_session_id: args.stripe_session_id,
      created_at: now(),
    });
    return { granted: true, duplicate: false };
  },
});

export const listForUser = query({
  args: { user_id: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("credit_ledger")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .order("desc")
      .take(Math.min(100, Math.max(1, args.limit ?? 25)));
    return rows;
  },
});
