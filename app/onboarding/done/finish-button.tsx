"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export function FinishButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-8 flex justify-end">
      <button
        type="button"
        className="btn-primary px-11 py-[18px] text-xl"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/onboarding/complete", { method: "POST" });
          router.push("/dashboard/create");
        }}
      >
        {busy ? "One moment…" : "Go to Dashboard"} <Icon name="chevronRight" size={20} />
      </button>
    </div>
  );
}
