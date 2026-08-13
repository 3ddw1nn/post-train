// Pure pricing data — safe to import from client AND server components. Keep
// it that way: components/plan-picker.tsx is "use client", and every export
// of a "use client" file becomes a client-only reference on import, so shared
// constants like PLAN_ICON below have to live outside it to be usable from a
// server component (e.g. the marketing page).
export type PaidPlan = "creator" | "growth" | "pro";

export const PLAN_ICON: Record<PaidPlan, string> = {
  creator: "sparkles",
  growth: "chart",
  pro: "stack",
};

export const PLANS: Record<
  PaidPlan,
  {
    name: string;
    audience: string;
    monthly: number;
    yearly: number;
    accounts: number | null; // null = unlimited
    badge?: string;
    features: string[];
  }
> = {
  creator: {
    name: "Creator",
    audience: "For solo creators getting consistent",
    monthly: 28,
    yearly: 308,
    accounts: 15,
    badge: "Most popular",
    features: [
      "15 connected social accounts",
      "Unlimited posts & scheduling",
      "Carousels & bulk scheduling",
      "Content studio templates",
      "5 GB workspace storage",
      "60 AI video credits/month",
      "Analytics",
      "API + MCP access (60 req/min)",
      "Human support",
    ],
  },
  growth: {
    name: "Growth",
    audience: "For brands posting across many accounts",
    monthly: 48,
    yearly: 528,
    accounts: 50,
    features: [
      "50 connected social accounts",
      "Everything in Creator",
      "Invite team members",
      "25 GB workspace storage",
      "100 AI video credits/month",
      "API + MCP access (300 req/min)",
      "Viral growth consulting",
      "Priority human support",
    ],
  },
  pro: {
    name: "Pro",
    audience: "For agencies and power operators",
    monthly: 98,
    yearly: 980,
    accounts: null,
    badge: "Best deal",
    features: [
      "Unlimited connected accounts",
      "Everything in Growth",
      "Create & manage teams",
      "100 GB workspace storage",
      "200 AI video credits/month",
      "API + MCP access (1,000 req/min)",
      "Priority human support",
    ],
  },
};

/**
 * Legacy: the API used to be a paid add-on gating API v1 + MCP. Access now
 * ships with every paid plan (lib/entitlements.ts → apiAccess), so this price
 * is only still referenced by existing-subscriber billing UI. Don't offer it
 * to new customers — it grants nothing.
 */
export const API_ADDON = { monthly: 5, yearly: 50 };
export const TRIAL_DAYS = 7;

/**
 * One-time AI credit top-ups, for when a plan's monthly allowance runs out.
 * Bought outright (Stripe `mode: "payment"`), never expire, and are only spent
 * after the allowance is exhausted.
 *
 * 1 credit = 5s of avatar video ~= $0.125 of provider spend, so the price
 * floor is credits * 0.125. These sit at roughly 2.4-3x that, easing off with
 * volume. scripts/check-credits.mjs asserts the markup and the volume
 * discount, so adjust these numbers freely and let it fail if one drifts too
 * close to cost.
 *
 * Note the deliberate tradeoff: at $0.30-0.38/credit these are CHEAPER per
 * credit than upgrading a plan (marginal ~$0.50/credit), so a heavy user can
 * top up rather than move up a tier. That favours the customer and still
 * clears cost; raise these if recurring upgrade revenue matters more.
 */
export type CreditPack = { id: string; credits: number; price: number };
export const CREDIT_PACKS: CreditPack[] = [
  { id: "small", credits: 50, price: 19 },
  { id: "medium", credits: 150, price: 49 },
  { id: "large", credits: 400, price: 119 },
];

/** Custom top-up bounds. The floor keeps Stripe's per-transaction fee from
 *  eating the sale; the ceiling is a fat-finger and fraud guard. */
export const CREDIT_MIN_DOLLARS = 2;
export const CREDIT_MAX_DOLLARS = 500;
/** $/credit for amounts below the cheapest pack — no volume discount yet. */
export const CREDIT_BASE_RATE = 0.45;

/**
 * Credits a custom dollar amount buys, on the same volume curve as the packs:
 * the rate of the largest pack the spend reaches, or the base rate below that.
 * Spending exactly a pack's price yields exactly that pack, so custom amounts
 * and packs can never disagree and neither can be arbitraged against the other.
 *
 * Integer arithmetic on purpose. `dollars / (price / credits)` routes through
 * an inexact intermediate (49/(49/150) is 150.00000000000003) and whether it
 * floors correctly is a property of the specific numbers — a repricing could
 * silently start selling 149 credits for the 150 pack. Multiplying first is
 * exact at every pack price by construction.
 *
 * Always floors: rounding must never grant more than was paid for.
 */
export function creditsForDollars(dollars: number): number {
  const tier = [...CREDIT_PACKS]
    .sort((a, b) => b.price - a.price)
    .find((pack) => dollars >= pack.price);
  if (tier) return Math.floor((dollars * tier.credits) / tier.price);
  return Math.floor((dollars * 100) / (CREDIT_BASE_RATE * 100));
}
