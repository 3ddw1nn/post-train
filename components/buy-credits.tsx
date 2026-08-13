"use client";

// Buying AI credit top-ups. Two entry points share one flow: a compact button
// (shown where a render is blocked) and a full pack picker on the billing page.
// Both POST to /api/billing/credits and hand off to Stripe Checkout — nothing
// is granted client-side; the webhook credits the ledger once payment clears.
import { useState } from "react";
import {
  CREDIT_MAX_DOLLARS,
  CREDIT_MIN_DOLLARS,
  CREDIT_PACKS,
  creditsForDollars,
} from "@/lib/billing-data";
import { describeCredits } from "@/lib/entitlements";
import { Icon } from "./icons";
import { ActionButton } from "./interactive";

function useCheckout() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function buy(packId: string, amount?: number) {
    setPending(packId);
    setError("");
    try {
      const response = await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(amount === undefined ? { pack: packId } : { amount }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        throw new Error(data?.error?.message ?? "Could not start checkout.");
      }
      window.location.assign(data.url);
    } catch (e) {
      // Only clears on failure — on success the page is already navigating,
      // and re-enabling the button would invite a double purchase.
      setPending(null);
      setError(e instanceof Error ? e.message : "Could not start checkout.");
    }
  }

  return { pending, error, buy };
}

/** Compact CTA for the "out of credits" state inside a studio. */
export function BuyCreditsButton() {
  const { pending, error, buy } = useCheckout();
  const smallest = CREDIT_PACKS[0];
  return (
    <>
      <button
        type="button"
        onClick={() => void buy(smallest.id)}
        disabled={!!pending}
        className="btn-primary !py-1.5 text-xs disabled:opacity-50"
      >
        {pending ? "Starting…" : `Buy ${smallest.credits} credits · $${smallest.price}`}
      </button>
      {error && <p className="mt-1 w-full text-xs font-semibold text-danger">{error}</p>}
    </>
  );
}

/**
 * Monthly allowance bar. Shared by the billing page and the AI UGC studio so
 * the two can't drift in how a balance is presented.
 */
export function CreditAllowanceMeter({
  used,
  cap,
  purchased,
  surface = "page",
}: {
  used: number;
  cap: number;
  purchased: number;
  /** Track colour, so the bar reads on both white cards and grey panels. */
  surface?: "page" | "white";
}) {
  const left = Math.max(0, cap - used);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          Left this month
        </span>
        <span className="text-sm font-bold tabular-nums text-ink">
          {left} <span className="font-semibold text-muted">of {cap}</span>
        </span>
      </div>
      <div
        className={`mt-2 h-1.5 overflow-hidden rounded-full ${surface === "white" ? "bg-page" : "bg-white"}`}
        role="progressbar"
        aria-label="AI credits used this month"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Math.min(used, cap)}
      >
        <div
          className={`h-full rounded-full transition-[width] ${left === 0 ? "bg-danger" : "bg-primary"}`}
          style={{ width: `${cap > 0 ? Math.min(100, (used / cap) * 100) : 100}%` }}
        />
      </div>
      {purchased > 0 && (
        <p className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-muted">
          <span>+ top-up credits</span>
          <span className="tabular-nums text-ink">{purchased}</span>
        </p>
      )}
    </div>
  );
}

/** Amount box for buying an arbitrary top-up. */
function CustomAmount({ pending, onBuy }: { pending: string | null; onBuy: (dollars: number) => void }) {
  const [value, setValue] = useState("");
  const dollars = Number(value);
  const valid =
    Number.isFinite(dollars) && dollars >= CREDIT_MIN_DOLLARS && dollars <= CREDIT_MAX_DOLLARS;
  const credits = valid ? creditsForDollars(dollars) : 0;

  return (
    <div className="mt-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Or enter an amount
          </span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="text-sm font-bold text-muted">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={CREDIT_MIN_DOLLARS}
              max={CREDIT_MAX_DOLLARS}
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={String(CREDIT_MIN_DOLLARS)}
              aria-label="Custom top-up amount in dollars"
              className="input !w-28 !py-1.5"
            />
          </span>
        </label>
        <button
          type="button"
          onClick={() => onBuy(dollars)}
          disabled={!valid || !!pending}
          className="btn-subtle !py-1.5 text-sm disabled:opacity-50"
        >
          {pending === "custom" ? "Starting…" : (<><Icon name="plus" size={14} /> Buy</>)}
        </button>
        <p className="text-xs font-semibold text-muted">
          {value === ""
            ? `Minimum $${CREDIT_MIN_DOLLARS}, maximum $${CREDIT_MAX_DOLLARS}.`
            : valid
              ? `${credits} credits · ${describeCredits(credits)}`
              : `Enter $${CREDIT_MIN_DOLLARS}–$${CREDIT_MAX_DOLLARS}.`}
        </p>
      </div>
    </div>
  );
}

/** Full pack picker for the billing page. */
export function CreditPackPicker({ purchased }: { purchased: number }) {
  const { pending, error, buy } = useCheckout();
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-extrabold">AI credit top-ups</h2>
        <p className="text-xs font-semibold text-muted">
          {purchased > 0 ? `${purchased} top-up credits banked` : "No top-up credits yet"}
        </p>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted">
        Your plan includes a monthly AI allowance. Top-ups cover anything beyond it, never
        expire, and are only spent once the monthly allowance runs out. Bigger amounts get a
        better rate.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <div key={pack.id} className="rounded-xl border border-line p-4">
            <p className="text-lg font-black text-ink">
              {pack.credits} <span className="text-sm font-bold text-muted">credits</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-muted">
              ${pack.price} · {describeCredits(pack.credits)}
            </p>
            <button
              type="button"
              onClick={() => void buy(pack.id)}
              disabled={!!pending}
              className="btn-subtle mt-3 w-full justify-center !py-1.5 text-sm disabled:opacity-50"
            >
              {pending === pack.id ? "Starting…" : (<><Icon name="plus" size={14} /> Buy</>)}
            </button>
          </div>
        ))}
      </div>
      <CustomAmount pending={pending} onBuy={(dollars) => void buy("custom", dollars)} />
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

export type LastTopUp = {
  credits: number;
  pack: string;
  created_at: string;
  expires_at: string;
  already_refunded: boolean;
  within_window: boolean;
  balance_sufficient: boolean;
} | null;

/**
 * Only the single most recent top-up is ever refundable — see
 * convex/credits.ts's lastRefundableTopUp for why. This renders that one
 * purchase plus either a refund button or the specific reason it can't be
 * refunded right now, so "why is this greyed out" is never a mystery.
 */
export function TopUpRefundBlock({ info }: { info: LastTopUp }) {
  if (!info) {
    return <p className="mt-4 border-t border-line pt-4 text-xs text-muted">No top-up purchases yet.</p>;
  }
  const pack = CREDIT_PACKS.find((p) => p.id === info.pack);
  const purchaseLabel = pack
    ? `${info.credits} credits ($${pack.price})`
    : `${info.credits} credits (custom top-up)`;
  const eligible = !info.already_refunded && info.within_window && info.balance_sufficient;
  const reason = info.already_refunded
    ? "Already refunded."
    : !info.within_window
      ? "The 48-hour refund window has passed."
      : !info.balance_sufficient
        ? "Some of these credits have already been used."
        : null;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Last purchase</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">
            {purchaseLabel}
            <span className="font-medium text-muted">
              {" "}
              ·{" "}
              {new Date(info.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </p>
        </div>
        {eligible ? (
          <ActionButton
            endpoint="/api/billing/credits/refund"
            className="btn-subtle"
            confirmTitle="Refund this top-up?"
            confirmText={`This refunds the purchase and removes ${info.credits} credits from your balance. It can't be undone.`}
            confirmLabel="Refund"
          >
            Request refund
          </ActionButton>
        ) : (
          <p className="text-xs font-semibold text-muted">{reason}</p>
        )}
      </div>
      {eligible && (
        <p className="mt-1.5 text-xs text-muted">
          Refundable until{" "}
          {new Date(info.expires_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          .
        </p>
      )}
    </div>
  );
}
