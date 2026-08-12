import { requireUser } from "@/lib/auth";
import { getSubscription, createCreditPackCheckout } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";

// Buy an AI credit top-up. Returns a Stripe Checkout URL for the client to
// redirect to; the grant itself happens in the webhook once payment clears.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const packId = typeof body.pack === "string" ? body.pack : "";
    // Credits only top up a plan's allowance — without a subscription there's
    // nothing to top up, and buying them would strand the purchase.
    if (!entitled(await getSubscription(user.id))) {
      throw new DomainError(400, "Credit top-ups require an active subscription.", "paywall");
    }
    const origin = new URL(req.url).origin;
    const url = await createCreditPackCheckout(user.id, user.email, packId, origin);
    return Response.json({ url });
  } catch (e) {
    return jsonError(e);
  }
}
