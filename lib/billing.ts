// Real Stripe billing. Subscription lifecycle (activation, renewal, past_due,
// cancellation) is driven by webhooks (app/api/webhooks/stripe/route.ts) —
// this file only issues Stripe API calls and mirrors the immediate result
// into Convex so the UI doesn't have to wait a round trip for the webhook.
import { convexMutation, convexQuery, now, uid } from "./db";
import { PLANS, API_ADDON, TRIAL_DAYS, CREDIT_PACKS, creditsForDollars, type PaidPlan } from "./billing-data";
import { stripe, planPriceId, addonPriceId, creditPackPriceId } from "./stripe";
import { api } from "@/convex/_generated/api";

export { PLANS, API_ADDON, TRIAL_DAYS, CREDIT_PACKS };

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

/**
 * Buy a one-time AI credit pack. `mode: "payment"`, not a subscription item —
 * credits are a one-off purchase that never renews, so adding them to the
 * subscription (the setApiAddon shape) would bill them again every period.
 *
 * Nothing is granted here. The webhook credits the ledger once Stripe confirms
 * payment, so an abandoned checkout can't mint credits.
 */
export async function createCreditPackCheckout(
  userId: string,
  userEmail: string,
  packId: string,
  origin: string
): Promise<string> {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown credit pack.");
  const existing = await getSubscription(userId);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: creditPackPriceId(pack.id), quantity: 1 }],
    client_reference_id: userId,
    // Read back by the webhook — the price-id reverse lookup is the fallback.
    metadata: { user_id: userId, credit_pack: pack.id, credits: String(pack.credits) },
    ...(existing?.stripe_customer_id
      ? { customer: existing.stripe_customer_id }
      : { customer_email: userEmail }),
    success_url: `${origin}/dashboard/settings/billing?credits=success`,
    cancel_url: `${origin}/dashboard/settings/billing`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

/**
 * Buy a custom-sized top-up. Same one-time `mode: "payment"` flow as a pack,
 * but with an inline `price_data` line item, so an arbitrary amount needs no
 * pre-created Stripe price.
 *
 * `dollars` must already be validated by the caller. Credits are derived here
 * from the amount rather than accepted from anywhere — the number the customer
 * is charged and the number they are granted come from the same input.
 */
export async function createCustomCreditCheckout(
  userId: string,
  userEmail: string,
  dollars: number,
  origin: string
): Promise<string> {
  const credits = creditsForDollars(dollars);
  if (credits < 1) throw new Error("That amount does not buy any credits.");
  const existing = await getSubscription(userId);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(dollars * 100),
          product_data: {
            name: `${credits} AI credits`,
            description: `One-time top-up of ${credits} AI UGC credits. Never expires.`,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: userId,
    metadata: { user_id: userId, credit_pack: "custom", credits: String(credits) },
    ...(existing?.stripe_customer_id
      ? { customer: existing.stripe_customer_id }
      : { customer_email: userEmail }),
    success_url: `${origin}/dashboard/settings/billing?credits=success`,
    cancel_url: `${origin}/dashboard/settings/billing`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
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

/**
 * Refund one AI credit top-up purchase and claw its credits back.
 *
 * Eligibility (48-hour window, not already refunded, unspent balance) is the
 * caller's job — app/api/billing/credits/refund/route.ts checks it against a
 * fresh read of convex/credits.ts's lastRefundableTopUp right before calling
 * this, the same split refundLatestCharge/api/billing/refund uses. This
 * function only ever does the Stripe call and records it.
 *
 * Order matters: Stripe first, ledger second. If the ledger write fails after
 * a successful Stripe refund, the customer keeps a few credits they were
 * refunded for — an accepted, narrow risk, not a silent double-refund (Stripe
 * itself refuses to refund the same payment_intent twice).
 */
export async function refundTopUpPurchase(
  userId: string,
  purchaseId: string,
  stripeSessionId: string,
  credits: number
): Promise<void> {
  const session = await stripe().checkout.sessions.retrieve(stripeSessionId);
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error("No payment found for this purchase.");
  await stripe().refunds.create({ payment_intent: paymentIntentId });
  const result = await convexMutation<{ recorded: boolean; duplicate: boolean }>(api.credits.recordRefund, {
    id: uid(),
    user_id: userId,
    purchase_id: purchaseId,
    credits,
  });
  if (!result.recorded && !result.duplicate) throw new Error("Could not record the refund.");
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
