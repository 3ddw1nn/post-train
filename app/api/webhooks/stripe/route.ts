import Stripe from "stripe";
import { stripe, planFromPriceId, isAddonPriceId, creditPackFromPriceId } from "@/lib/stripe";
import { CREDIT_PACKS } from "@/lib/billing-data";
import { convexMutation, convexQuery, now, uid } from "@/lib/db";
import { api } from "@/convex/_generated/api";

// Source of truth for subscription lifecycle. Stripe retries on non-2xx, so
// unhandled event types return 200 (nothing to do) rather than an error.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook not configured." }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig ?? "", secret);
  } catch (e) {
    return Response.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      // One-time AI credit pack. Granted here rather than at checkout creation
      // so an abandoned or failed payment can't mint credits.
      if (session.mode === "payment") {
        if (userId && session.payment_status === "paid") await grantCreditsFromSession(userId, session);
        break;
      }
      if (!userId || session.mode !== "subscription" || !session.subscription) break;
      const stripeSub = await stripe().subscriptions.retrieve(session.subscription as string);
      await upsertFromStripeSubscription(userId, stripeSub);
      await convexMutation(api.users.patchUser, {
        id: userId,
        patch: { first_subscribed_at: now(), onboarded_at: now() },
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId(stripeSub);
      if (userId) await upsertFromStripeSubscription(userId, stripeSub);
      break;
    }
    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId(stripeSub);
      if (userId) {
        await convexMutation(api.billing.patchByUser, {
          user_id: userId,
          patch: { status: "canceled", updated_at: now() },
        });
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ ok: true });
}

/**
 * Credit a paid top-up to the ledger.
 *
 * Idempotent on the session id inside the Convex mutation, which matters:
 * Stripe retries deliveries, and a duplicate here would be free credits.
 * Session metadata is the primary source for how many credits were bought;
 * the line item's price id is the fallback if metadata is ever missing.
 */
async function grantCreditsFromSession(userId: string, session: Stripe.Checkout.Session) {
  let packId = session.metadata?.credit_pack ?? null;
  let credits = Number(session.metadata?.credits ?? 0);
  if (!packId || !Number.isFinite(credits) || credits <= 0) {
    const items = await stripe().checkout.sessions.listLineItems(session.id, { limit: 1 });
    const priceId = items.data[0]?.price?.id;
    packId = priceId ? creditPackFromPriceId(priceId) : null;
    credits = CREDIT_PACKS.find((p) => p.id === packId)?.credits ?? 0;
  }
  if (!packId || credits <= 0) return; // not a pack we recognise — leave it alone
  await convexMutation(api.credits.grantPurchase, {
    id: uid(),
    user_id: userId,
    credits,
    reason: "top-up",
    ref_id: packId,
    stripe_session_id: session.id,
  });
}

async function resolveUserId(stripeSub: Stripe.Subscription): Promise<string | null> {
  if (stripeSub.metadata?.user_id) return stripeSub.metadata.user_id;
  const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
  const existing = await convexQuery<{ user_id: string } | null>(api.billing.findByStripeCustomer, {
    stripe_customer_id: customerId,
  });
  return existing?.user_id ?? null;
}

async function upsertFromStripeSubscription(userId: string, stripeSub: Stripe.Subscription) {
  const planItem = stripeSub.items.data.find((i) => !isAddonPriceId(i.price.id));
  const addonItem = stripeSub.items.data.find((i) => isAddonPriceId(i.price.id));
  const resolved = planItem ? planFromPriceId(planItem.price.id) : null;
  if (!resolved) return; // unrecognized price — nothing we can map to a local plan

  const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
  const periodEnd = planItem?.current_period_end
    ? new Date(planItem.current_period_end * 1000).toISOString()
    : null;

  await convexMutation(api.billing.upsertSubscription, {
    id: uid(),
    user_id: userId,
    plan: resolved.plan,
    interval: resolved.interval,
    status: stripeSub.status,
    cancel_at_period_end: stripeSub.cancel_at_period_end ? 1 : 0,
    trial_ends_at: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
    current_period_end: periodEnd,
    api_addon: addonItem ? 1 : 0,
    api_addon_interval: addonItem ? (addonItem.plan?.interval as "month" | "year") ?? null : null,
    stripe_customer_id: customerId,
    stripe_subscription_id: stripeSub.id,
  });
}
