// Entitlement logic per spec 11 §3, with the trial-cancel nuance from 02 §3:
// cancelling DURING a trial revokes immediately; cancelling a PAID period keeps
// features until period end (FAQ behavior).
import type { Subscription } from "./billing";
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

export const apiAccess = (sub: Subscription | null) => entitled(sub) && !!sub!.api_addon;

export const studioAccess = (sub: Subscription | null) => entitled(sub);

// ponytail: flat per-workspace monthly cap on AI UGC generations. Upgrade
// path: per-plan caps + purchasable credit packs via the billing addon route.
export const STUDIO_AI_MONTHLY_CAP = 30;

export function planLabel(sub: Subscription | null): string | null {
  const plan = planOf(sub);
  return plan === "free" ? null : `${plan.charAt(0).toUpperCase()}${plan.slice(1)} Plan`;
}
