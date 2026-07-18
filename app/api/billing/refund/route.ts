import { requireUser } from "@/lib/auth";
import { getSubscription, refundLatestCharge } from "@/lib/billing";
import { queueEmail } from "@/lib/emails";

// Refund-on-request within 7 days of a charge (spec FAQ). Refunds the latest
// Stripe invoice's charge and cancels the subscription immediately.
export async function POST() {
  const user = await requireUser();
  const sub = await getSubscription(user.id);
  if (!sub || sub.status === "canceled") {
    return Response.json(
      { error: { message: "No active subscription to refund." } },
      { status: 400 }
    );
  }
  const chargedAt = sub.trial_ends_at ? new Date(sub.trial_ends_at) : new Date(sub.created_at);
  if (sub.status !== "trialing" && Date.now() - chargedAt.getTime() > 7 * 86400_000) {
    return Response.json(
      { error: { message: "Refunds are available within 7 days of a charge — contact support." } },
      { status: 400 }
    );
  }
  try {
    await refundLatestCharge(user.id);
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "Refund failed." } },
      { status: 400 }
    );
  }
  await queueEmail(user.id, "refund", "Your refund is on the way", "We've processed your refund. Sorry to see you go!");
  return Response.json({ ok: true });
}
