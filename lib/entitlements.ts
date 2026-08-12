// Entitlement logic per spec 11 §3, with the trial-cancel nuance from 02 §3:
// cancelling DURING a trial revokes immediately; cancelling a PAID period keeps
// features until period end (FAQ behavior).
/**
 * The only fields entitlement decisions read. Declared structurally instead of
 * importing lib/billing's Subscription so this module stays free of Stripe and
 * Convex imports — a real Subscription still satisfies it, and staying
 * dependency-light is what lets scripts/check-credits.mjs compile it standalone.
 */
export type Subscription = {
  plan: string;
  status: string;
  cancel_at_period_end: number;
};

export const FREE_ACCOUNT_CAP = 3; // small free cap [SPEC]

export function entitled(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (!["trialing", "active"].includes(sub.status)) return false;
  if (sub.status === "trialing" && sub.cancel_at_period_end) return false; // observed: immediate revoke
  return true;
}

export function planOf(sub: Subscription | null): "free" | "creator" | "growth" | "pro" {
  return entitled(sub) ? (sub!.plan as "creator" | "growth" | "pro") : "free";
}

export function maxAccounts(sub: Subscription | null): number {
  const plan = planOf(sub);
  return { free: FREE_ACCOUNT_CAP, creator: 15, growth: 50, pro: Infinity }[plan];
}

export function canCreatePosts(
  sub: Subscription | null,
  user?: { is_staff?: boolean | number }
): boolean {
  return !!user?.is_staff || entitled(sub);
}

export const analyticsAccess = (sub: Subscription | null) =>
  entitled(sub) && ["creator", "growth", "pro"].includes(sub!.plan);

export const teamsCreate = (sub: Subscription | null) =>
  entitled(sub) && ["growth", "pro"].includes(sub!.plan);

// Workspaces a user may OWN (create and keep). Every account is grandfathered
// one workspace at signup regardless of plan, so free/creator both cap at 1 —
// the cap only blocks creating additional ones beyond that.
export function ownedWorkspaceCap(sub: Subscription | null): number {
  const plan = planOf(sub);
  return { free: 1, creator: 1, growth: 3, pro: 6 }[plan];
}

// Workspaces a user may JOIN as a non-owner (invited member/admin elsewhere).
export function joinableWorkspaceCap(sub: Subscription | null): number {
  const plan = planOf(sub);
  return { free: 1, creator: 1, growth: 1, pro: 2 }[plan];
}

/**
 * API v1 + the MCP server. Included with every paid plan — the separate
 * `api_addon` purchase no longer gates access (billing still records it, and
 * lib/billing.ts still sells it, so stop offering the add-on in checkout
 * before anyone buys something that grants nothing).
 */
export const apiAccess = (sub: Subscription | null) => entitled(sub);

/**
 * Requests per minute per credential against API v1 + the MCP server. Tiered so
 * automating hard is a reason to move up a plan rather than a wall every paid
 * customer hits at the same place. `free` never applies in practice (apiAccess
 * gates first) but is present so the lookup is total.
 */
export function apiRateLimit(sub: Subscription | null): number {
  const plan = planOf(sub);
  return { free: 0, creator: 60, growth: 300, pro: 1000 }[plan];
}

export const studioAccess = (sub: Subscription | null) => entitled(sub);

/**
 * 1 credit = 5 seconds of avatar video (~$0.125 of Replicate spend).
 *
 * Lives here rather than in lib/studio.ts so the server, the wizard UI, and
 * scripts/check-credits.mjs all price a render from one definition — studio.ts
 * pulls in ffmpeg and node built-ins and can't be imported by a client
 * component or compiled standalone.
 */
export const SECONDS_PER_CREDIT = 5;
export function creditsForSeconds(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / SECONDS_PER_CREDIT));
}

/**
 * Monthly AI UGC credits included with a plan, counted across every workspace
 * the subscriber owns (see aiUsageThisMonth). 1 credit = 5s of avatar video
 * ~= $0.125 of provider spend, so these budget AI cost at roughly 25% of plan
 * revenue: creator ~$7.50 of $28, growth ~$12.50 of $48, pro ~$25 of $98.
 *
 * Scoped to the account rather than the workspace on purpose — ownedWorkspaceCap
 * lets Pro hold 6 workspaces, so a per-workspace cap sold 6x what we priced.
 *
 * ponytail: allowance only, no top-up packs yet. Upgrade path is a credit
 * ledger plus one-time Stripe Checkout packs, consumed after the allowance.
 */
export function studioAiMonthlyCredits(sub: Subscription | null): number {
  const base = { free: 0, creator: 60, growth: 100, pro: 200 }[planOf(sub)];
  // A 7-day trial shouldn't be able to spend a full month of provider budget.
  return sub?.status === "trialing" ? Math.min(base, 20) : base;
}

export function planLabel(sub: Subscription | null): string | null {
  const plan = planOf(sub);
  return plan === "free" ? null : `${plan.charAt(0).toUpperCase()}${plan.slice(1)} Plan`;
}
