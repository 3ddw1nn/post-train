import { requireUser } from "@/lib/auth";
import { getSubscription, createCreditPackCheckout, createCustomCreditCheckout } from "@/lib/billing";
import { CREDIT_MIN_DOLLARS, CREDIT_MAX_DOLLARS } from "@/lib/billing-data";
import { entitled } from "@/lib/entitlements";
import { DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";

// Buy AI credits — either a fixed pack (`pack`) or a custom dollar amount
// (`amount`). Returns a Stripe Checkout URL for the client to redirect to; the
// grant itself happens in the webhook once payment clears.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Credits only top up a plan's allowance — without a subscription there's
    // nothing to top up, and buying them would strand the purchase.
    if (!entitled(await getSubscription(user.id))) {
      throw new DomainError(400, "Credit top-ups require an active subscription.", "paywall");
    }
    const origin = new URL(req.url).origin;

    if (body.amount !== undefined) {
      const dollars = Number(body.amount);
      // This is the money input and it comes from the request body, so every
      // property is checked here rather than trusted: a NaN would sail through
      // a bare range comparison, and fractional cents can't be charged.
      if (!Number.isFinite(dollars)) {
        throw new DomainError(400, "Enter a valid amount.");
      }
      if (Math.round(dollars * 100) !== dollars * 100) {
        throw new DomainError(400, "Amounts can't be smaller than one cent.");
      }
      if (dollars < CREDIT_MIN_DOLLARS) {
        throw new DomainError(400, `The minimum top-up is $${CREDIT_MIN_DOLLARS}.`);
      }
      if (dollars > CREDIT_MAX_DOLLARS) {
        throw new DomainError(400, `The maximum top-up is $${CREDIT_MAX_DOLLARS}.`);
      }
      // Credits are derived from this validated amount inside the checkout
      // helper — a client-supplied credit count is never accepted.
      const url = await createCustomCreditCheckout(user.id, user.email, dollars, origin);
      return Response.json({ url });
    }

    const packId = typeof body.pack === "string" ? body.pack : "";
    const url = await createCreditPackCheckout(user.id, user.email, packId, origin);
    return Response.json({ url });
  } catch (e) {
    return jsonError(e);
  }
}
