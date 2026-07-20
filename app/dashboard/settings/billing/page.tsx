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
  const sub = await getSubscription(user.id);
  const plan = sub && sub.plan !== "free" ? PLANS[sub.plan as PaidPlan] : null;
  const live = entitled(sub);
  const price = plan ? (sub!.interval === "year" ? plan.yearly : plan.monthly) : 0;

  if (user.is_staff) {
    return (
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-page/50 px-5 py-3">
          <Icon name="card" size={14} className="text-muted" />
          <h2 className="text-sm font-bold">Current plan</h2>
        </div>
        <div className="p-5">
          <h3 className="text-xl font-bold">Staff Account</h3>
          <p className="mt-1 text-sm text-muted">
            Full access to every feature — no billing or subscription needed.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Icon name="card" size={14} className="text-muted" />
            <h2 className="text-sm font-bold">Current plan</h2>
          </div>
          {sub && sub.status !== "canceled" && (
            <div className="flex items-center gap-1.5">
              {sub.status === "trialing" && !sub.cancel_at_period_end && (
                <Pill tone="warning">Trial</Pill>
              )}
              {sub.status === "paused" && <Pill tone="neutral">Paused</Pill>}
              {!!sub.cancel_at_period_end && <Pill tone="neutral">Cancelling</Pill>}
            </div>
          )}
        </div>

        {!sub || sub.status === "canceled" ? (
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h3 className="text-xl font-bold">Free Plan</h3>
              <p className="mt-1 text-sm text-muted">
                5 free posts (each destination account counts as one), limited connections.
              </p>
            </div>
            <Link href="/dashboard/settings/plans" className="btn-primary">
              View Plans
            </Link>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-xl font-bold">{plan?.name} Plan</h3>
              <p className="text-sm font-semibold tabular-nums">
                ${price}
                <span className="font-medium text-muted">
                  /{sub.interval === "year" ? "year" : "month"}
                </span>
              </p>
            </div>

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
            {!!sub.cancel_at_period_end && sub.status === "trialing" && (
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

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
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
                    className="btn-subtle"
                    confirmText="Pause your subscription? Posting is blocked while paused."
                  >
                    Pause Subscription
                  </ActionButton>
                  <ActionButton
                    endpoint="/api/billing/cancel"
                    className="btn-subtle"
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
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5">
          <div>
            <h3 className="font-bold">API Addon</h3>
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
