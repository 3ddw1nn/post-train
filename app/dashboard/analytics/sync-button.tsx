"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export function SyncButton({ platform }: { platform?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-subtle"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/app/analytics-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(platform ? { platform } : {}),
        });
        router.refresh();
        setBusy(false);
      }}
    >
      <Icon name="refresh" size={14} className={busy ? "animate-spin" : ""} />
      {busy ? "Syncing…" : platform ? `Sync ${platform}` : "Sync all"}
    </button>
  );
}
