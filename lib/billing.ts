// Real Stripe billing. Subscription lifecycle (activation, renewal, past_due,
// cancellation) is driven by webhooks (app/api/webhooks/stripe/route.ts) —
// this file only issues Stripe API calls and mirrors the immediate result
// into Convex so the UI doesn't have to wait a round trip for the webhook.
import { convexMutation, convexQuery, now } from "./db";
import { PLANS, API_ADDON, TRIAL_DAYS, type PaidPlan } from "./billing-data";
import { stripe, planPriceId, addonPriceId } from "./stripe";
import { api } from "@/convex/_generated/api";

export { PLANS, API_ADDON, TRIAL_DAYS };

export type Plan = "free" | "creator" | "growth" | "pro";
export type Subscription = {
  id: string;
  user_id: string;
  plan: Plan;
  interval: "month" | "year";
  status: "trialing" | "active" | "past_due" | "canceled" | "paused";
  cancel_at_period_end: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  api_addon: number;
  api_addon_interval: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  created_at: string;
  updated_at: string;
};

export async function getSubscription(userId: string): Promise<Subscription | null> {
  return await convexQuery<Subscription | null>(api.billing.getSubscription, { user_id: userId });
}

function requireStripeSubscriptionId(sub: Subscription | null): string {
  if (!sub?.stripe_subscription_id) throw new Error("No active subscription found.");
  return sub.stripe_subscription_id;
}

/** New subscriber: real Stripe Checkout Session (hosted page), 7-day trial. */
export async function createCheckoutSession(
  userId: string,
  userEmail: string,
  plan: PaidPlan,
  interval: "month" | "year",
  origin: string
): Promise<string> {
  const existing = await getSubscription(userId);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: planPriceId(plan, interval), quantity: 1 }],
    subscription_data: {
      trial_period_days: existing ? undefined : TRIAL_DAYS,
      metadata: { user_id: userId },
    },
    client_reference_id: userId,
    ...(existing?.stripe_customer_id
      ? { customer: existing.stripe_customer_id }
      : { customer_email: userEmail }),
    success_url: `${origin}/dashboard/settings/billing?checkout=success`,
    cancel_url: `${origin}/dashboard/settings/plans`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/** Existing subscriber changing plans: update the live Stripe subscription in place (prorated). */
export async function changePlan(userId: string, plan: PaidPlan, interval: "month" | "year") {
  const sub = await getSubscription(userId);
  const subId = requireStripeSubscriptionId(sub);
  const stripeSub = await stripe().subscriptions.retrieve(subId);
  const item = stripeSub.items.data[0];
  const updated = await stripe().subscriptions.update(subId, {
    items: [{ id: item.id, price: planPriceId(plan, interval) }],
    proration_behavior: "create_prorations",
  });
  await convexMutation(api.billing.patchByUser, {
    user_id: userId,
    patch: {
      plan,
      interval,
      status: updated.status,
      current_period_end: new Date(updated.items.data[0].current_period_end * 1000).toISOString(),
      updated_at: now(),
    },
  });
}

export async function cancelSubscription(userId: string) {
  const sub = await getSubscription(userId);
  const subId = requireStripeSubscriptionId(sub);
  await stripe().subscriptions.update(subId, { cancel_at_period_end: true });
  await convexMutation(api.billing.patchByUser, {
    user_id: userId,
    patch: { cancel_at_period_end: 1, updated_at: now() },
  });
}

export async function pauseSubscription(userId: string) {
  const sub = await getSubscription(userId);
  const subId = requireStripeSubscriptionId(sub);
  await stripe().subscriptions.update(subId, { pause_collection: { behavior: "void" } });
  await convexMutation(api.billing.patchByUser, {
    user_id: userId,
    patch: { status: "paused", updated_at: now() },
  });
}

export async function resumeSubscription(userId: string) {
  const sub = await getSubscription(userId);
  const subId = requireStripeSubscriptionId(sub);
  const updated = await stripe().subscriptions.update(subId, {
    pause_collection: null,
    cancel_at_period_end: false,
  });
  await convexMutation(api.billing.patchByUser, {
    user_id: userId,
    patch: { status: updated.status, cancel_at_period_end: 0, updated_at: now() },
  });
}

export async function setApiAddon(userId: string, on: boolean, interval: "month" | "year" = "year") {
  const sub = await getSubscription(userId);
  const subId = requireStripeSubscriptionId(sub);
  const price = addonPriceId(interval);
  const stripeSub = await stripe().subscriptions.retrieve(subId, { expand: ["items.data.price"] });
  const existingItem = stripeSub.items.data.find(
    (i) => i.price.id === process.env.STRIPE_PRICE_ADDON_MONTHLY || i.price.id === process.env.STRIPE_PRICE_ADDON_YEARLY
  );

  if (on) {
    if (existingItem) {
      if (existingItem.price.id !== price) {
        await stripe().subscriptionItems.update(existingItem.id, { price });
      }
    } else {
      await stripe().subscriptionItems.create({ subscription: subId, price });
    }
  } else if (existingItem) {
    await stripe().subscriptionItems.del(existingItem.id);
  }

  await convexMutation(api.billing.patchByUser, {
    user_id: userId,
    patch: { api_addon: on ? 1 : 0, api_addon_interval: on ? interval : null, updated_at: now() },
  });
}

/** Refund-on-request within 7 days of a charge (spec FAQ) — refunds the latest invoice's charge. */
export async function refundLatestCharge(userId: string): Promise<void> {
  const sub = await getSubscription(userId);
  const subId = requireStripeSubscriptionId(sub);
  const stripeSub = await stripe().subscriptions.retrieve(subId, { expand: ["latest_invoice"] });
  const invoice = stripeSub.latest_invoice;
  const chargeId =
    typeof invoice === "object" && invoice && "charge" in invoice ? (invoice.charge as string | null) : null;
  if (!chargeId) throw new Error("No charge found on this subscription to refund.");
  await stripe().refunds.create({ charge: chargeId });
  await stripe().subscriptions.cancel(subId);
  await convexMutation(api.billing.patchByUser, {
    user_id: userId,
    patch: { status: "canceled", cancel_at_period_end: 1, updated_at: now() },
  });
}
