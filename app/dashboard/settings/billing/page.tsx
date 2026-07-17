import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { PLANS, API_ADDON, type PaidPlan } from "@/lib/billing-data";
import { entitled, apiAccess } from "@/lib/entitlements";
import { Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ActionButton } from "@/components/interactive";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const user = await requireOnboardedUser();
  const sub = getSubscription(user.id);
  const plan = sub && sub.plan !== "free" ? PLANS[sub.plan as PaidPlan] : null;
  const live = entitled(sub);
  const price = plan ? (sub!.interval === "year" ? plan.yearly : plan.monthly) : 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <Icon name="card" size={13} /> Current Plan
        </p>
        {!sub || sub.status === "canceled" ? (
          <>
            <h2 className="mt-2 text-2xl font-extrabold">Free Plan</h2>
            <p className="mt-1 text-sm text-muted">
              5 free posts (each destination account counts as one), limited connections.
            </p>
            <Link href="/dashboard/settings/plans" className="btn-primary mt-4">
              View Plans
            </Link>
          </>
        ) : (
          <>
            <div className="mt-2 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold">{plan?.name} Plan</h2>
              {sub.status === "trialing" && !sub.cancel_at_period_end && (
                <Pill tone="warning">Trial</Pill>
              )}
              {sub.status === "paused" && <Pill tone="neutral">Paused</Pill>}
              {sub.cancel_at_period_end && <Pill tone="neutral">Cancelling</Pill>}
            </div>
            <p className="text-sm text-muted">
              ${price}/{sub.interval === "year" ? "year" : "month"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              {sub.status === "trialing" && sub.trial_ends_at && (
                <>
                  <div>
                    <p className="text-xs font-bold text-muted">Trial ends</p>
                    <p className="font-semibold">
                      {new Date(sub.trial_ends_at).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted">Amount after trial</p>
                    <p className="font-semibold">${price}</p>
                  </div>
                </>
              )}
              {sub.status !== "trialing" && sub.current_period_end && (
                <div>
                  <p className="text-xs font-bold text-muted">
                    {sub.cancel_at_period_end ? "Access until" : "Renews"}
                  </p>
                  <p className="font-semibold">
                    {new Date(sub.current_period_end).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              )}
            </div>
            {sub.status === "trialing" && !sub.cancel_at_period_end && (
              <p className="mt-4 rounded-xl bg-warning-bg px-4 py-2.5 text-sm font-medium text-warning-ink">
                You&apos;re on a free trial! It ends{" "}
                {sub.trial_ends_at &&
                  new Date(sub.trial_ends_at).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                  })}
                {" — "}you&apos;ll be charged ${price} after. Cancel anytime before then.
              </p>
            )}
            {sub.cancel_at_period_end && sub.status === "trialing" && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                Your trial is cancelled — premium features are switched off and you
                won&apos;t be charged.
              </p>
            )}
            {sub.status === "paused" && (
              <p className="mt-4 rounded-xl bg-warning-bg px-4 py-2.5 text-sm font-medium text-warning-ink">
                Your subscription is paused — posting is blocked until you resume.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/settings/plans" className="btn-dark">
                Change Plan
              </Link>
              {sub.status === "paused" || sub.cancel_at_period_end ? (
                <ActionButton endpoint="/api/billing/resume" className="btn-primary">
                  Resume Subscription
                </ActionButton>
              ) : (
                <>
                  <ActionButton
                    endpoint="/api/billing/pause"
                    className="btn-dark"
                    confirmText="Pause your subscription? Posting is blocked while paused."
                  >
                    Pause Subscription
                  </ActionButton>
                  <ActionButton
                    endpoint="/api/billing/cancel"
                    className="btn-dark"
                    confirmText={
                      sub.status === "trialing"
                        ? "Cancel your trial? Premium features end immediately and you won't be charged."
                        : "Cancel your subscription? Paid features remain until the end of the billing period."
                    }
                  >
                    Cancel Subscription
                  </ActionButton>
                </>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">API Addon</h2>
            <p className="mt-0.5 text-sm text-muted">
              Programmatic posting via the REST API, MCP server and agent skills.
            </p>
            <p className="mt-1 text-xs font-semibold text-muted">
              ${API_ADDON.yearly}/year (or ${API_ADDON.monthly}/mo) · Requires an active
              subscription
            </p>
          </div>
          {sub && apiAccess(sub) ? (
            <div className="flex items-center gap-2">
              <Pill tone="success">Active</Pill>
              <ActionButton
                endpoint="/api/billing/addon"
                body={{ on: false }}
                className="btn-subtle"
                confirmText="Disable the API add-on? Your API keys will stop working."
              >
                Disable
              </ActionButton>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Pill tone="neutral">Inactive</Pill>
              <ActionButton
                endpoint="/api/billing/addon"
                body={{ on: true, interval: "year" }}
                className="btn-primary"
                disabled={!live}
                title={live ? undefined : "Requires an active subscription"}
              >
                Enable Addon
              </ActionButton>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-subtle cursor-not-allowed opacity-70"
          title="Simulated build — connect Stripe to enable the customer portal"
        >
          Stripe Billing Portal <Icon name="external" size={13} />
        </button>
        <ActionButton
          endpoint="/api/billing/refund"
          className="btn-subtle"
          confirmText="Request a refund? Your subscription ends immediately."
        >
          Request Refund
        </ActionButton>
        <p className="w-full text-xs text-muted">
          Refunds are honored within 7 days of any charge — no questions asked.
        </p>
      </div>
    </div>
  );
}
