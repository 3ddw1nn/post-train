import Stripe from "stripe";
import type { PaidPlan } from "./billing-data";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    client = new Stripe(key);
  }
  return client;
}

function priceId(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export const PRICE_IDS: Record<PaidPlan, { month: string; year: string }> = {
  creator: { month: "STRIPE_PRICE_CREATOR_MONTHLY", year: "STRIPE_PRICE_CREATOR_YEARLY" },
  growth: { month: "STRIPE_PRICE_GROWTH_MONTHLY", year: "STRIPE_PRICE_GROWTH_YEARLY" },
  pro: { month: "STRIPE_PRICE_PRO_MONTHLY", year: "STRIPE_PRICE_PRO_YEARLY" },
};

export function planPriceId(plan: PaidPlan, interval: "month" | "year"): string {
  return priceId(PRICE_IDS[plan][interval]);
}

export function addonPriceId(interval: "month" | "year"): string {
  return priceId(interval === "month" ? "STRIPE_PRICE_ADDON_MONTHLY" : "STRIPE_PRICE_ADDON_YEARLY");
}

/** Reverse-lookup: Stripe price id -> our plan/interval, for webhook events. */
export function planFromPriceId(id: string): { plan: PaidPlan; interval: "month" | "year" } | null {
  for (const plan of Object.keys(PRICE_IDS) as PaidPlan[]) {
    for (const interval of ["month", "year"] as const) {
      if (process.env[PRICE_IDS[plan][interval]] === id) return { plan, interval };
    }
  }
  return null;
}

export function isAddonPriceId(id: string): boolean {
  return id === process.env.STRIPE_PRICE_ADDON_MONTHLY || id === process.env.STRIPE_PRICE_ADDON_YEARLY;
}
