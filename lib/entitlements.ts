// Entitlement logic per spec 11 §3, with the trial-cancel nuance from 02 §3:
// cancelling DURING a trial revokes immediately; cancelling a PAID period keeps
// features until period end (FAQ behavior).
import type { Subscription } from "./billing";
import type { User } from "./auth";

export const FREE_POST_LIMIT = 5;
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

export function freePostsRemaining(user: User): number {
  return Math.max(0, FREE_POST_LIMIT - user.free_posts_used);
}

export function canCreatePosts(user: User, sub: Subscription | null): boolean {
  return entitled(sub) || freePostsRemaining(user) > 0;
}

export const analyticsAccess = (sub: Subscription | null) =>
  entitled(sub) && ["creator", "growth", "pro"].includes(sub!.plan);

export const teamsCreate = (sub: Subscription | null) =>
  entitled(sub) && ["growth", "pro"].includes(sub!.plan);

export const apiAccess = (sub: Subscription | null) => entitled(sub) && !!sub!.api_addon;

export const studioAccess = (sub: Subscription | null) => entitled(sub);

// ponytail: flat per-workspace monthly cap on AI UGC generations. Upgrade
// path: per-plan caps + purchasable credit packs via the billing addon route.
export const STUDIO_AI_MONTHLY_CAP = 30;

export function planLabel(sub: Subscription | null): string {
  const plan = planOf(sub);
  return plan === "free"
    ? "Free Plan"
    : `${plan.charAt(0).toUpperCase()}${plan.slice(1)} Plan`;
}
