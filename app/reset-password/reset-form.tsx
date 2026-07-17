"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (!token) {
    // No token → request a link
    return sent ? (
      <p className="text-center text-sm text-muted">
        If that email exists, a reset link has been created. In this local build it&apos;s
        printed to the server console.
      </p>
    ) : (
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await fetch("/api/auth/reset-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          setSent(true);
        }}
      >
        <input
          type="email"
          required
          placeholder="you@example.com"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn-primary">Send reset link</button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const res = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password: form.get("password") }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error?.message ?? "Something went wrong.");
          return;
        }
        router.push("/signin");
      }}
    >
      <input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder="New password (8+ characters)"
        className="input"
        autoComplete="new-password"
      />
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn-primary">Set new password</button>
    </form>
  );
}
