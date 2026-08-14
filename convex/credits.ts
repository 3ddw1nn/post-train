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
 *  spends already charged against it and any purchases since refunded to the
 *  customer (a refund claws credits back the same way a spend does — the
 *  money left, so the credits it bought have to leave too). Never expires. */
export async function purchasedBalance(ctx, userId: string) {
  const rows = await ctx.db
    .query("credit_ledger")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .collect();
  let balance = 0;
  for (const row of rows) {
    // "reversal" gives credits back for a render that never produced a video
    // (failed, timed out, or canceled) — the opposite direction to "refund",
    // which claws credits back because the customer's money was returned.
    if (row.kind === "purchase" || row.kind === "reversal") balance += row.credits;
    else if (row.kind === "spend" || row.kind === "refund") balance -= row.credits;
  }
  return Math.max(0, balance);
}

/**
 * Gives back the purchased credits a render was charged, when that render
 * ends without producing a video.
 *
 * Only the *overflow* is ledgered at spend time — the allowance-funded part is
 * derived from the job row and already self-corrects, because
 * allowanceUsedSince skips failed jobs. So without this, a render that dipped
 * into paid top-ups and then failed silently kept the user's money.
 *
 * Idempotent on the job id: replaying a failure (a retried tick, a cancel
 * racing the worker) must not mint credits.
 */
export async function reverseJobSpend(ctx, jobId: string) {
  const spend = await ctx.db
    .query("credit_ledger")
    .withIndex("by_legacy_id", (q) => q.eq("id", `cled_${jobId}`))
    .unique();
  if (!spend || spend.kind !== "spend") return 0;
  const existing = await ctx.db
    .query("credit_ledger")
    .withIndex("by_legacy_id", (q) => q.eq("id", `clrev_${jobId}`))
    .unique();
  if (existing) return 0;
  await ctx.db.insert("credit_ledger", {
    id: `clrev_${jobId}`,
    user_id: spend.user_id,
    kind: "reversal",
    credits: spend.credits,
    reason: "render-not-delivered",
    ref_id: jobId,
    stripe_session_id: null,
    created_at: now(),
  });
  return spend.credits;
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

/** Only the single most recent top-up is ever refundable — not "any purchase
 *  in the last 48h". If it's already been refunded, there's nothing else to
 *  offer; we don't fall back to an older purchase. */
const REFUND_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Read-only eligibility snapshot for the Billing page's refund button. The
 *  refund route re-derives this itself right before calling Stripe — this
 *  copy is for display only and must never be trusted as authorization. */
export const lastRefundableTopUp = query({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    const lastPurchase = await ctx.db
      .query("credit_ledger")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .filter((q) => q.eq(q.field("kind"), "purchase"))
      .order("desc")
      .first();
    if (!lastPurchase) return null;

    const alreadyRefunded = await ctx.db
      .query("credit_ledger")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .filter((q) => q.and(q.eq(q.field("kind"), "refund"), q.eq(q.field("ref_id"), lastPurchase.id)))
      .first();

    const balance = await purchasedBalance(ctx, args.user_id);
    const ageMs = Date.now() - new Date(lastPurchase.created_at).getTime();

    return {
      id: lastPurchase.id,
      credits: lastPurchase.credits,
      pack: lastPurchase.ref_id, // pack id, or "custom"
      created_at: lastPurchase.created_at,
      expires_at: new Date(new Date(lastPurchase.created_at).getTime() + REFUND_WINDOW_MS).toISOString(),
      stripe_session_id: lastPurchase.stripe_session_id ?? null,
      already_refunded: !!alreadyRefunded,
      within_window: ageMs <= REFUND_WINDOW_MS,
      // Blocks a refund once any of THIS purchase's credits could plausibly
      // have been spent. Credits are pooled, not tracked per-purchase, so the
      // conservative proxy is: current balance still covers what this
      // purchase alone granted — if spending has eaten into that, refuse.
      balance_sufficient: balance >= lastPurchase.credits,
    };
  },
});

/**
 * Records a top-up refund and claws back its credits. Called AFTER the
 * Stripe refund succeeds (lib/billing.ts) — mirrors grantPurchase's ordering,
 * money first, ledger second — and is idempotent on purchase_id so a retry
 * can't claw back the same purchase twice.
 */
export const recordRefund = mutation({
  args: {
    id: v.string(),
    user_id: v.string(),
    purchase_id: v.string(),
    credits: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("credit_ledger")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .filter((q) => q.and(q.eq(q.field("kind"), "refund"), q.eq(q.field("ref_id"), args.purchase_id)))
      .first();
    if (existing) return { recorded: false, duplicate: true };
    await ctx.db.insert("credit_ledger", {
      id: args.id,
      user_id: args.user_id,
      kind: "refund",
      credits: args.credits,
      reason: "top-up-refund",
      ref_id: args.purchase_id,
      stripe_session_id: null,
      created_at: now(),
    });
    return { recorded: true, duplicate: false };
  },
});
