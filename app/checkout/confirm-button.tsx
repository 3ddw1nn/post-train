"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConfirmCheckoutButton({
  plan,
  interval,
  live,
}: {
  plan: string;
  interval: string;
  live: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-primary mt-5 w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, interval }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          alert(data?.error?.message ?? "Checkout failed.");
          setBusy(false);
          return;
        }
        router.push(data.redirect);
        router.refresh();
      }}
    >
      {busy ? "Processing…" : live ? "Confirm change" : "Start 7 day free trial"}
    </button>
  );
}
