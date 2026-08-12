"use client";

// Buying AI credit top-ups. Two entry points share one flow: a compact button
// (shown where a render is blocked) and a full pack picker on the billing page.
// Both POST to /api/billing/credits and hand off to Stripe Checkout — nothing
// is granted client-side; the webhook credits the ledger once payment clears.
import { useState } from "react";
import { CREDIT_PACKS } from "@/lib/billing-data";
import { Icon } from "./icons";

function useCheckout() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function buy(packId: string) {
    setPending(packId);
    setError("");
    try {
      const response = await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
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
        expire, and are only spent once the monthly allowance runs out.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <div key={pack.id} className="rounded-xl border border-line p-4">
            <p className="text-lg font-black text-ink">
              {pack.credits} <span className="text-sm font-bold text-muted">credits</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-muted">
              ${pack.price} · about {Math.round((pack.credits * 5) / 60)} min of video
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
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
