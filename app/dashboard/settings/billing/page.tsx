import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { PLANS, type PaidPlan } from "@/lib/billing-data";
import { entitled, apiAccess, apiRateLimit, studioAiMonthlyCredits, monthStartIso } from "@/lib/entitlements";
import { Pill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ActionButton } from "@/components/interactive";
import { CreditPackPicker, CreditAllowanceMeter, TopUpRefundBlock, type LastTopUp } from "@/components/buy-credits";
import { convexQuery } from "@/lib/db";
import { api } from "@/convex/_generated/api";

export const metadata = { title: "Billing" };

function SectionHeader({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page/50 px-5 py-3">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={14} className="text-muted" />
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export default async function BillingPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const plan = sub && sub.plan !== "free" ? PLANS[sub.plan as PaidPlan] : null;
  const live = entitled(sub);
  const price = plan ? (sub!.interval === "year" ? plan.yearly : plan.monthly) : 0;
  // Account-scoped, matching how the allowance is enforced: one pool shared
  // across every workspace this user owns.
  const aiAllowance = studioAiMonthlyCredits(sub);
  const [credits, lastTopUp] = live
    ? await Promise.all([
        convexQuery<{ allowance_used: number; purchased: number }>(api.credits.balanceForOwner, {
          owner_id: user.id,
          allowance: aiAllowance,
          since: monthStartIso(),
        }),
        convexQuery<LastTopUp>(api.credits.lastRefundableTopUp, { user_id: user.id }),
      ])
    : [{ allowance_used: 0, purchased: 0 }, null];

  if (user.is_staff) {
    return (
      <section className="card overflow-hidden">
        <SectionHeader icon="card" title="Current plan" />
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
      {/* Plan — subscription lifecycle and the only place its own portal/refund live. */}
      <section className="card overflow-hidden">
        <SectionHeader
          icon="card"
          title="Current plan"
          right={
            sub && sub.status !== "canceled" ? (
              <div className="flex items-center gap-1.5">
                {sub.status === "trialing" && !sub.cancel_at_period_end && (
                  <Pill tone="warning">Trial</Pill>
                )}
                {sub.status === "paused" && <Pill tone="neutral">Paused</Pill>}
                {!!sub.cancel_at_period_end && <Pill tone="neutral">Cancelling</Pill>}
              </div>
            ) : undefined
          }
        />

        {!sub || sub.status === "canceled" ? (
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h3 className="text-xl font-bold">No active subscription</h3>
              <p className="mt-1 text-sm text-muted">
                Subscribe to create, schedule, publish, and unlock premium dashboard features.
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

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
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
        )}
      </section>

      {/* API & MCP — bundled into every paid plan, so this is a status panel,
          not a purchase. Key management lives at /dashboard/api-keys; usage
          alongside every other quota lives on the Usage page. */}
      <section className="card overflow-hidden">
        <SectionHeader icon="key" title="API & MCP" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm text-muted">
              Programmatic posting via the REST API, signed webhooks, and the MCP server for
              Claude and other AI agents.
            </p>
            <p className="mt-1 text-xs font-semibold text-muted">
              {apiAccess(sub)
                ? `Included with your plan · ${apiRateLimit(sub).toLocaleString()} requests/min`
                : "Included with every paid plan"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={apiAccess(sub) ? "success" : "neutral"}>
              {apiAccess(sub) ? "Included" : "Upgrade to unlock"}
            </Pill>
            <Link href="/dashboard/settings/usage" className="btn-subtle">
              Manage
            </Link>
          </div>
        </div>
      </section>

      {/* AI credits — its own purchase (top-ups) and its own refund, scoped
          to the last top-up rather than the subscription. */}
      {live && (
        <section className="card overflow-hidden">
          <SectionHeader icon="sparkles" title="AI video credits" />
          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-md text-sm text-muted">
                Used by the AI UGC Video Studio. 1 credit renders 5 seconds of video, so a
                longer script costs more.
              </p>
              <div className="w-full max-w-xs">
                <CreditAllowanceMeter
                  used={credits.allowance_used}
                  cap={aiAllowance}
                  purchased={credits.purchased}
                  surface="white"
                />
              </div>
            </div>
            <div className="mt-5 border-t border-line pt-5">
              <CreditPackPicker purchased={credits.purchased} />
            </div>
            <TopUpRefundBlock info={lastTopUp} />
            <p className="mt-2 text-xs text-muted">
              Top-up refunds are honored within 48 hours of purchase, and only while none of
              that purchase&apos;s credits have been spent.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
