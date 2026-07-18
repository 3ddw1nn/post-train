import { requireUser } from "@/lib/auth";
import { changePlan } from "@/lib/billing";
import { PLANS, type PaidPlan } from "@/lib/billing-data";

// Existing subscriber switching plans — updates the live Stripe subscription
// in place (prorated) rather than starting a new Checkout Session.
export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const plan = String(body?.plan ?? "") as PaidPlan;
  const interval = body?.interval === "month" ? "month" : "year";
  if (!PLANS[plan]) {
    return Response.json({ error: { message: "Unknown plan." } }, { status: 400 });
  }
  await changePlan(user.id, plan, interval);
  return Response.json({ ok: true, redirect: "/dashboard/settings/billing" });
}
