import { requireUser } from "@/lib/auth";
import { refundTopUpPurchase } from "@/lib/billing";
import { convexQuery } from "@/lib/db";
import { api } from "@/convex/_generated/api";

type LastPurchase = {
  id: string;
  credits: number;
  stripe_session_id: string | null;
  already_refunded: boolean;
  within_window: boolean;
  balance_sufficient: boolean;
} | null;

// Refund-on-request for AI credit top-ups: only the single most recent
// purchase, only within 48 hours, and only if none of its credits have been
// spent yet. Mirrors /api/billing/refund's shape (eligibility here, the
// actual Stripe call in lib/billing.ts).
export async function POST() {
  const user = await requireUser();
  const last = await convexQuery<LastPurchase>(api.credits.lastRefundableTopUp, { user_id: user.id });

  if (!last) {
    return Response.json({ error: { message: "No top-up purchase to refund." } }, { status: 400 });
  }
  if (last.already_refunded) {
    return Response.json({ error: { message: "This purchase has already been refunded." } }, { status: 400 });
  }
  if (!last.within_window) {
    return Response.json(
      { error: { message: "This purchase is outside the 48-hour refund window." } },
      { status: 400 }
    );
  }
  if (!last.balance_sufficient) {
    return Response.json(
      {
        error: {
          message: "Some of these credits have already been used, so this purchase can no longer be refunded.",
        },
      },
      { status: 400 }
    );
  }
  if (!last.stripe_session_id) {
    return Response.json({ error: { message: "No payment found for this purchase." } }, { status: 400 });
  }

  try {
    await refundTopUpPurchase(user.id, last.id, last.stripe_session_id, last.credits);
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "Refund failed." } },
      { status: 400 }
    );
  }
  return Response.json({ ok: true });
}
