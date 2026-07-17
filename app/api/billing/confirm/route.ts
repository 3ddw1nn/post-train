import { requireUser } from "@/lib/auth";
import { confirmCheckout } from "@/lib/billing";
import { PLANS, type PaidPlan } from "@/lib/billing-data";
import { getDb, now } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const plan = String(body?.plan ?? "") as PaidPlan;
  const interval = body?.interval === "month" ? "month" : "year";
  if (!PLANS[plan]) {
    return Response.json({ error: { message: "Unknown plan." } }, { status: 400 });
  }
  confirmCheckout(user.id, plan, interval);
  // Returning from checkout completes onboarding (spec 11 §2)
  if (!user.onboarded_at) {
    getDb().prepare("UPDATE users SET onboarded_at = ? WHERE id = ?").run(now(), user.id);
  }
  // Checkout return always lands on the Billing tab (spec 04 guards)
  return Response.json({ ok: true, redirect: "/dashboard/settings/billing" });
}
