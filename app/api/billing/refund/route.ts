import { requireUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { getDb, now } from "@/lib/db";
import { queueEmail } from "@/lib/emails";

// Refund-on-request within 7 days of a charge (spec FAQ). Simulated: revokes
// the subscription immediately and logs a confirmation email.
export async function POST() {
  const user = await requireUser();
  const sub = getSubscription(user.id);
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
  getDb()
    .prepare(
      "UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = 1, updated_at = ? WHERE user_id = ?"
    )
    .run(now(), user.id);
  queueEmail(user.id, "refund", "Your refund is on the way", "We've processed your refund. Sorry to see you go!");
  return Response.json({ ok: true });
}
