"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Real Bluesky sign-in: handle + app password (no OAuth app needed). */
export function BlueskyForm({
  suggestion,
  returnTo,
}: {
  suggestion: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(suggestion);
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/connections/bluesky", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, app_password: appPassword }),
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
      <label className="text-xs font-semibold text-muted">Bluesky handle</label>
      <div className="flex items-center gap-1">
        <span className="text-muted">@</span>
        <input
          className="input"
          value={identifier}
          required
          placeholder="you.bsky.social"
          onChange={(e) => setIdentifier(e.target.value.replace(/^@/, ""))}
        />
      </div>
      <label className="text-xs font-semibold text-muted">App password</label>
      <input
        className="input"
        type="password"
        value={appPassword}
        required
        placeholder="xxxx-xxxx-xxxx-xxxx"
        onChange={(e) => setAppPassword(e.target.value)}
      />
      <p className="text-xs text-muted">
        Create one at{" "}
        <a
          href="https://bsky.app/settings/app-passwords"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary-deep underline"
        >
          bsky.app/settings/app-passwords
        </a>
        {" "}— not your main password. You can revoke it anytime.
      </p>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !identifier.trim() || !appPassword.trim()}>
        {busy ? "Connecting…" : "Connect Bluesky"}
      </button>
    </form>
  );
}
