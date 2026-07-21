"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode === "signin" ? "signin" : "signup"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        display_name: form.get("display_name") || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    router.push(data.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === "signup" && (
        <input
          name="display_name"
          placeholder="Your name"
          className="input"
          autoComplete="name"
        />
      )}
      <input
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        className="input"
        autoComplete="email"
      />
      <input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder="Password (8+ characters)"
        className="input"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
      />
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "One moment…" : mode === "signin" ? "Log in" : "Create account"}
      </button>
    </form>
  );
}
