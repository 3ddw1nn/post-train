"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        message: form.get("message"),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message ?? "Something went wrong — try again.");
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-deep">
          <Icon name="check" size={22} strokeWidth={2.5} />
        </span>
        <p className="text-lg font-bold">Message sent</p>
        <p className="max-w-xs text-sm text-muted">
          Thanks for reaching out — a real person will get back to you soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Name</span>
        <input name="name" required className="input" placeholder="Your name" autoComplete="name" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Email</span>
        <input
          name="email"
          type="email"
          required
          className="input"
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Message</span>
        <textarea
          name="message"
          required
          rows={5}
          className="input resize-none"
          placeholder="What's on your mind?"
        />
      </label>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
