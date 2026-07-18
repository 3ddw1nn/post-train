import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PLANS, type PaidPlan } from "@/lib/billing-data";
import { getSubscription, createCheckoutSession } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { LogoMark } from "@/components/logo";
import { ConfirmChangeButton } from "./confirm-button";

export const metadata = { title: "Checkout" };

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
  const sub = await getSubscription(user.id);
  const live = entitled(sub);

  // New subscribers go straight to Stripe's hosted Checkout — no in-app card form needed.
  if (!live) {
    const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = await createCheckoutSession(user.id, user.email, plan, interval, origin);
    redirect(url);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] px-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <div>
              <p className="text-sm font-bold leading-tight">Post Train</p>
              <p className="text-xs text-muted">Change subscription</p>
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
            <p className="mt-2 text-xs text-muted">
              Your plan changes immediately — you&apos;ll be charged or credited a prorated
              amount on your next invoice.
            </p>
          </div>
          <ConfirmChangeButton plan={plan} interval={interval} />
          <Link
            href="/dashboard/settings/plans"
            className="mt-3 block text-center text-sm font-medium text-muted hover:text-ink"
          >
            ← Cancel and go back
          </Link>
        </div>
      </div>
    </main>
  );
}
