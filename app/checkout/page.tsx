import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PLANS, TRIAL_DAYS, type PaidPlan } from "@/lib/billing-data";
import { getSubscription } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { LogoMark } from "@/components/logo";
import { ConfirmCheckoutButton } from "./confirm-button";

export const metadata = { title: "Checkout" };

// Simulated Stripe Checkout. ponytail: real build replaces this route with a
// redirect to a Stripe Checkout Session (trial_period_days: 7) and keeps the
// same success URL (/dashboard/settings/billing).
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const plan = params.plan as PaidPlan;
  const interval = params.interval === "month" ? "month" : "year";
  if (!PLANS[plan]) notFound();
  const p = PLANS[plan];
  const amount = interval === "year" ? p.yearly : p.monthly;
  const sub = getSubscription(user.id);
  const live = entitled(sub);
  const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400_000);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] px-4">
      <div className="w-full max-w-md">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">
          Simulated checkout — stands in for Stripe
        </p>
        <div className="card p-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <div>
              <p className="text-sm font-bold leading-tight">Post Train</p>
              <p className="text-xs text-muted">
                {live ? "Change subscription" : `${TRIAL_DAYS}-day free trial`}
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-page p-4">
            <div className="flex items-baseline justify-between">
              <p className="font-bold">
                {p.name} · {interval === "year" ? "Yearly" : "Monthly"}
              </p>
              <p className="font-bold">
                ${amount}/{interval === "year" ? "yr" : "mo"}
              </p>
            </div>
            {!live && (
              <>
                <div className="mt-3 flex items-baseline justify-between text-sm text-muted">
                  <span>Due today</span>
                  <span className="text-lg font-extrabold text-ink">$0.00</span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Your trial ends {trialEnd.toLocaleDateString()} — you&apos;ll be charged $
                  {amount} unless you cancel first.
                </p>
              </>
            )}
          </div>
          <div className="mt-5 flex flex-col gap-2 text-xs text-muted">
            <label className="font-semibold text-ink">Card details</label>
            <input className="input" placeholder="4242 4242 4242 4242 (any input works here)" />
            <div className="flex gap-2">
              <input className="input" placeholder="MM / YY" />
              <input className="input" placeholder="CVC" />
            </div>
          </div>
          <ConfirmCheckoutButton plan={plan} interval={interval} live={live} />
          <Link
            href={user.onboarded_at ? "/dashboard/settings/plans" : "/onboarding/plans"}
            className="mt-3 block text-center text-sm font-medium text-muted hover:text-ink"
          >
            ← Cancel and go back
          </Link>
        </div>
      </div>
    </main>
  );
}
