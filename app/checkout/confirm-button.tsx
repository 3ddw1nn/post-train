"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Existing subscriber only — new subscribers are redirected straight to Stripe Checkout. */
export function ConfirmChangeButton({ plan, interval }: { plan: string; interval: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn-primary mt-5 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/billing/change-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan, interval }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            setError(data?.error?.message ?? "Could not change plan.");
            setBusy(false);
            return;
          }
          router.push(data.redirect);
          router.refresh();
        }}
      >
        {busy ? "Processing…" : "Confirm change"}
      </button>
      {error && <p className="mt-2 text-center text-sm font-medium text-danger">{error}</p>}
    </>
  );
}
