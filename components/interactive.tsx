"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
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
  confirmTitle = "Confirm action",
  confirmLabel = "Delete",
  confirmTone = "danger",
  redirectTo,
  onSuccess,
  disabled,
  title,
}: {
  children: React.ReactNode;
  endpoint: string;
  method?: string;
  body?: Record<string, unknown>;
  className?: string;
  confirmText?: string;
  confirmTitle?: string;
  confirmLabel?: string;
  confirmTone?: "danger" | "default";
  redirectTo?: string;
  onSuccess?: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Something went wrong.");
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
      }
      await onSuccess?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        title={title}
        onClick={() => {
          if (confirmText) {
            setConfirmOpen(true);
            return;
          }
          void run();
        }}
      >
        {children}
      </button>
      {confirmOpen && (
        <ActionDialog
          title={confirmTitle}
          message={confirmText}
          confirmLabel={confirmLabel}
          tone={confirmTone === "danger" ? "danger" : undefined}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={async () => {
            await run();
            setConfirmOpen(false);
          }}
        />
      )}
      {error && (
        <ActionDialog
          title="Something went wrong"
          message={error}
          confirmLabel="OK"
          onCancel={() => setError(null)}
          onConfirm={() => setError(null)}
        />
      )}
    </>
  );
}

function ActionDialog({
  title,
  message,
  confirmLabel,
  tone,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  tone?: "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">{title}</p>
        {message && <p className="mt-2 text-sm text-muted">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {(tone === "danger" || confirmLabel !== "OK") && (
            <button type="button" className="btn-subtle" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className={tone === "danger" ? "btn-danger" : "btn-primary"}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function FormDialog({
  title,
  message,
  fields,
  confirmLabel = "Save",
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  title: string;
  message?: string;
  fields: {
    name: string;
    label: string;
    defaultValue?: string;
    placeholder?: string;
    type?: "text" | "email" | "password";
    required?: boolean;
  }[];
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ""]))
  );
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const canSubmit = fields.every((field) => !field.required || values[field.name]?.trim());
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <form
        className="card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void onSubmit(values);
        }}
      >
        <p className="text-lg font-extrabold">{title}</p>
        {message && <p className="mt-2 text-sm text-muted">{message}</p>}
        <div className="mt-4 flex flex-col gap-3">
          {fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1.5 text-sm font-semibold">
              {field.label}
              <input
                className="input"
                type={field.type ?? "text"}
                value={values[field.name] ?? ""}
                placeholder={field.placeholder}
                autoFocus={field === fields[0]}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [field.name]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-subtle" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !canSubmit}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const estimatedHeight = menuRef.current?.offsetHeight ?? 180;
    let nextTop = side === "top" ? rect.top - estimatedHeight - 6 : rect.bottom + 6;
    if (side === "bottom" && nextTop + estimatedHeight > window.innerHeight - 8) {
      nextTop = rect.top - estimatedHeight - 6;
    }
    const nextLeft = align === "right" ? rect.right - width : rect.left;
    setPos({
      top: Math.max(8, nextTop),
      left: Math.min(Math.max(8, nextLeft), window.innerWidth - width - 8),
    });
  }, [open, align, side, width]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[120] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg fade-up"
          style={{ width, top: pos.top, left: pos.left }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a, button")) setOpen(false);
          }}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

export type SelectOption = { value: string; label: string };

/** Drop-in replacement for a native <select> — same value/onChange shape, our own popover chrome. */
export function Select({
  value,
  onChange,
  options,
  disabled,
  className,
  width = 200,
  align = "left",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  width?: number;
  align?: "left" | "right";
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <Dropdown
      align={align}
      width={width}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={`input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
        >
          <span className="truncate">{selected?.label ?? ""}</span>
          <Icon name="chevronDown" size={15} className="shrink-0 text-muted" />
        </button>
      }
    >
      <div className="max-h-72 overflow-y-auto py-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-page ${
                active ? "text-primary-deep" : "text-ink"
              }`}
            >
              <Icon name="check" size={14} className={active ? "text-primary-deep" : "opacity-0"} />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </Dropdown>
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
              <ActionButton
                endpoint="/api/support-chat"
                method="DELETE"
                confirmTitle="Clear conversation?"
                confirmText="This removes the current support chat history."
                confirmLabel="Clear"
                confirmTone="default"
                className="text-xs text-muted hover:text-ink"
                title="Clear conversation"
                onSuccess={fetchMessages}
              >
                Clear
              </ActionButton>
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
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Status</p>
        <Select
          className="mt-1"
          value={status}
          disabled={busy}
          onChange={(v) => {
            setStatus(v);
            save({ status: v });
          }}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
        />
      </div>
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
