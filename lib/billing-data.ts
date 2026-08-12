// Pure pricing data — safe to import from client components.
export type PaidPlan = "creator" | "growth" | "pro";

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
