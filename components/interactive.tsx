"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "./icons";

/** iOS-style toggle that PATCHes a JSON body on change. */
export function Toggle({
  on,
  endpoint,
  field,
  label,
  onChange,
}: {
  on: boolean;
  endpoint?: string;
  field?: string;
  label?: string;
  onChange?: (v: boolean) => void;
}) {
  const [value, setValue] = useState(on);
  const router = useRouter();
  return (
    <button
      type="button"
      className="pt-toggle"
      data-on={value}
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={async () => {
        const next = !value;
        setValue(next);
        onChange?.(next);
        if (endpoint && field) {
          await fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [field]: next }),
          });
          router.refresh();
        }
      }}
    >
      <span />
    </button>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className="input bg-page font-mono text-xs" />
      <button
        type="button"
        className="btn-subtle shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={15} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Countdown({ until, className }: { until: string; className?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(until).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);
  if (left === null) return <span className={className}>—</span>;
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <span className={className}>
      {h > 0 ? `${h}h ${m}m left` : `${m}m ${s}s left`}
    </span>
  );
}

/** POST/PATCH/DELETE a JSON body, then refresh — with optional confirm. */
export function ActionButton({
  children,
  endpoint,
  method = "POST",
  body,
  className = "btn-subtle",
  confirmText,
  redirectTo,
  disabled,
  title,
}: {
  children: React.ReactNode;
  endpoint: string;
  method?: string;
  body?: Record<string, unknown>;
  className?: string;
  confirmText?: string;
  redirectTo?: string;
  disabled?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      title={title}
      onClick={async () => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(true);
        try {
          const res = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error?.message ?? "Something went wrong.");
            return;
          }
          if (redirectTo) {
            router.push(redirectTo);
          }
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}

/** Click-toggled dropdown that closes on outside click. */
export function Dropdown({
  trigger,
  children,
  align = "left",
  side = "bottom",
  width = 220,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  side?: "top" | "bottom";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg fade-up ${side === "top" ? "mb-1.5" : "mt-1.5"}`}
          style={{ width, [align === "left" ? "left" : "right"]: 0, [side === "top" ? "bottom" : "top"]: "100%" }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

type ChatMessage = {
  _id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "complete" | "error";
  provider: string | null;
};

const CHAT_COPY = {
  app: {
    title: "Post Train Support",
    disclaimer: "AI-assisted answers. For anything urgent, email ehleedev@gmail.com.",
    greeting: "Hey 👋 Ask me anything about scheduling, accounts, or your plan.",
    suggestions: [
      "How do I connect a new social account?",
      "Why did my post fail?",
      "How does the posting queue work?",
      "How do I upgrade my plan?",
    ],
  },
  marketing: {
    title: "Post Train",
    disclaimer: "AI-assisted answers. For anything urgent, email ehleedev@gmail.com.",
    greeting: "Hey 👋 Ask me anything about Post Train.",
    suggestions: [
      "Which platforms do you support?",
      "How much does it cost?",
      "Can I try it for free?",
      "How is this different from other schedulers?",
    ],
  },
} as const;

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 0.15, 0.3].map((delay) => (
        <span
          key={delay}
          className="pt-typing-dot h-1.5 w-1.5 rounded-full bg-current"
          style={{ ["--delay" as string]: `${delay}s` }}
        />
      ))}
    </span>
  );
}

/** Staff sidebar nav with pathname-based active highlighting. */
export function StaffNav({ items }: { items: { label: string; href: string; icon: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="nav-item" data-active={pathname === item.href}>
          <Icon name={item.icon} size={16} />
          <span className="flex-1">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}

export function ChatLauncher({ variant = "app" }: { variant?: "app" | "marketing" }) {
  const copy = CHAT_COPY[variant];
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [needsLeadCapture, setNeedsLeadCapture] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({ name: "", email: "", message: "" });
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollAttempts = useRef(0);

  const isPending = messages.some((m) => m.role === "assistant" && m.status === "pending");

  async function fetchMessages() {
    const res = await fetch("/api/support-chat");
    const data = await res.json();
    setMessages(data.messages ?? []);
    setNeedsLeadCapture(!!data.needsLeadCapture);
    setLoaded(true);
  }

  useEffect(() => {
    if (open && !loaded) fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, messages]);

  // ponytail: this app has no client-side Convex subscription wired into the
  // shell, so the pending assistant reply is polled rather than pushed. Caps
  // at ~30s; upgrade path is a real useQuery once ConvexReactClient is mounted.
  useEffect(() => {
    if (!open || !isPending || pollAttempts.current >= 20) return;
    const t = setTimeout(() => {
      pollAttempts.current += 1;
      fetchMessages();
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPending, messages]);

  useEffect(() => {
    if (!isPending) pollAttempts.current = 0;
  }, [isPending]);

  async function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy || isPending) return;
    setError(null);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Couldn't send that. Try again.");
        setInput(trimmed);
        return;
      }
      await fetchMessages();
    } finally {
      setBusy(false);
    }
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    const name = leadForm.name.trim();
    const email = leadForm.email.trim();
    if (!name || !email || leadBusy) return;
    setLeadBusy(true);
    setLeadError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          message: leadForm.message.trim() || null,
          source: "marketing_chat",
          pagePath: window.location.pathname,
          referrer: document.referrer || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setLeadError(data?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      setNeedsLeadCapture(false);
      await send(leadForm.message.trim() || `Hi, I'm ${name} — tell me more about Post Train.`);
    } finally {
      setLeadBusy(false);
    }
  }

  async function clearChat() {
    if (!window.confirm("Clear this conversation?")) return;
    await fetch("/api/support-chat", { method: "DELETE" });
    await fetchMessages();
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl fade-up sm:right-6">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-bold">{copy.title}</p>
              <p className="text-[11px] text-muted">{copy.disclaimer}</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={clearChat} className="text-xs text-muted hover:text-ink" title="Clear conversation">
                Clear
              </button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {!loaded && <p className="text-sm text-muted">Loading…</p>}

            {loaded && needsLeadCapture && (
              <form onSubmit={submitLead} className="flex flex-col gap-2">
                <p className="text-sm font-bold">{copy.greeting}</p>
                <p className="text-xs text-muted">Leave your info so we can follow up if we get disconnected.</p>
                <input
                  className="input"
                  placeholder="Name"
                  value={leadForm.name}
                  onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
                <input
                  className="input"
                  type="email"
                  placeholder="Email"
                  value={leadForm.email}
                  onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
                <textarea
                  className="input"
                  rows={2}
                  placeholder="What can we help with? (optional)"
                  value={leadForm.message}
                  onChange={(e) => setLeadForm((f) => ({ ...f, message: e.target.value }))}
                />
                {leadError && <p className="text-xs text-danger">{leadError}</p>}
                <button type="submit" className="btn-primary" disabled={leadBusy}>
                  {leadBusy ? "Starting…" : "Start chat"}
                </button>
              </form>
            )}

            {loaded && !needsLeadCapture && messages.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink">{copy.greeting}</p>
                <div className="flex flex-col gap-1.5">
                  {copy.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-left text-xs text-ink hover:bg-page"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m._id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-contrast"
                    : `mr-auto bg-page text-ink ${m.status === "error" ? "text-danger" : ""}`
                }`}
              >
                {m.role === "assistant" && m.status === "pending" ? (
                  <TypingDots />
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.role === "assistant" && m.status === "complete" && m.provider && (
                      <p className="mt-1 text-[10px] opacity-60">via {m.provider}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {loaded && !needsLeadCapture && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-line p-3"
            >
              <input
                className="input"
                placeholder="Type a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy || isPending}
              />
              <button
                type="submit"
                aria-label="Send"
                className="btn-primary !px-2.5 !py-2"
                disabled={busy || isPending || !input.trim()}
              >
                <Icon name="send" size={16} />
              </button>
            </form>
          )}
          {error && <p className="border-t border-line px-4 py-2 text-xs text-danger">{error}</p>}
        </div>
      )}
      <button
        type="button"
        aria-label="Support chat"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-primary p-3.5 text-primary-contrast shadow-xl transition-transform hover:scale-105"
      >
        <Icon name={open ? "x" : "chat"} size={22} strokeWidth={2} />
      </button>
    </>
  );
}

const LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified", "converted", "lost"] as const;

/** Staff-only status + notes editor for a single lead. */
export function LeadDetail({ leadId, status: initialStatus, notes: initialNotes }: { leadId: string; status: string; notes: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setSaved(false);
    try {
      await fetch(`/api/staff/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-bold uppercase tracking-wide text-muted">
        Status
        <select
          className="input mt-1"
          value={status}
          disabled={busy}
          onChange={(e) => {
            setStatus(e.target.value);
            save({ status: e.target.value });
          }}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold uppercase tracking-wide text-muted">
        Notes
        <textarea
          className="input mt-1"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button type="button" className="btn-subtle self-start" disabled={busy} onClick={() => save({ notes })}>
        {saved ? "Saved" : "Save notes"}
      </button>
    </div>
  );
}
