"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConsentForm({
  platform,
  platformName,
  suggestion,
  returnTo,
  reconnect,
}: {
  platform: string;
  platformName: string;
  suggestion: string;
  returnTo: string;
  reconnect?: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/connections/mock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, username, reconnect }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error?.message ?? "Could not connect this account.");
          setBusy(false);
          return;
        }
        router.push(returnTo);
        router.refresh();
      }}
    >
      <label className="text-xs font-semibold text-muted">
        {platformName} username
      </label>
      <div className="flex items-center gap-1">
        <span className="text-muted">@</span>
        <input
          className="input"
          value={username}
          required
          onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
        />
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !username.trim()}>
        {busy ? "Connecting…" : reconnect ? "Re-authorize" : "Authorize"}
      </button>
      <button
        type="button"
        className="btn-subtle w-full"
        onClick={() => {
          router.push(returnTo + (returnTo.includes("?") ? "&" : "?") + "error=oauth_cancelled");
        }}
      >
        Cancel
      </button>
    </form>
  );
}
