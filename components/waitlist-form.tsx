"use client";

import { useState } from "react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        source: "waitlist",
        pagePath: window.location.pathname,
        referrer: document.referrer || null,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    setDone(true);
    setBusy(false);
  }

  if (done) {
    return (
      <p className="rounded-lg bg-primary-soft px-4 py-3 text-sm font-medium text-primary-deep">
        You&apos;re on the list — we&apos;ll email you when it&apos;s your turn.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        name="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="input"
        autoComplete="email"
      />
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "One moment…" : "Join waitlist"}
      </button>
    </form>
  );
}
