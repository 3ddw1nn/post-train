"use client";

import { useEffect, useState } from "react";
import { PaywallModal } from "./paywall-modal";

const SEEN_KEY = "pt_paywall_seen";

/** Shows the plan paywall once per browser for free-tier users landing in the dashboard. */
export function DashboardPaywall({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (show && !localStorage.getItem(SEEN_KEY)) setOpen(true);
  }, [show]);

  if (!open) return null;
  return (
    <PaywallModal
      onClose={() => {
        localStorage.setItem(SEEN_KEY, "1");
        setOpen(false);
      }}
    />
  );
}
