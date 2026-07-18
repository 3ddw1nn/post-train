"use client";

import { useState } from "react";

/** Federated — user picks their own instance. Registers with that instance via
 * fetch first (so a bad/unreachable server shows an inline error here) and only
 * navigates away once we have a real authorize URL to send them to. */
export function MastodonForm({
  returnTo,
  reconnect,
}: {
  returnTo: string;
  reconnect?: string;
}) {
  const [instance, setInstance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const params = new URLSearchParams({ instance, return: returnTo });
        if (reconnect) params.set("reconnect", reconnect);
        const res = await fetch(`/api/connections/mastodon/start?${params}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error?.message ?? "Could not connect to that server.");
          setBusy(false);
          return;
        }
        window.location.href = data.authorize_url;
      }}
    >
      <label className="text-xs font-semibold text-muted">Your Mastodon server</label>
      <input
        className="input"
        value={instance}
        required
        placeholder="@you@mastodon.social"
        onChange={(e) => setInstance(e.target.value)}
      />
      <p className="text-xs text-muted">
        The server your account is on — the part after the @ in your handle
        (e.g. @you@<strong>mastodon.social</strong>).
      </p>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !instance.trim()}>
        {busy ? "Connecting…" : "Continue to your server"}
      </button>
    </form>
  );
}
