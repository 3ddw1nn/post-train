"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  width = 220,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
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
          className="absolute z-50 mt-1.5 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg fade-up"
          style={{ width, [align === "left" ? "left" : "right"]: 0 }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 rounded-2xl border border-line bg-white p-4 shadow-2xl fade-up">
          <p className="text-sm font-bold">Need a hand? 👋</p>
          <p className="mt-1 text-sm text-muted">
            We answer fast — usually within a few hours. Email us and a human will
            get back to you.
          </p>
          <a href="mailto:support@posttrain.example" className="btn-primary mt-3 w-full">
            Email support
          </a>
        </div>
      )}
      <button
        type="button"
        aria-label="Support chat"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-blue-600 p-3.5 text-white shadow-xl transition-transform hover:scale-105"
      >
        <Icon name={open ? "x" : "chat"} size={22} strokeWidth={2} />
      </button>
    </>
  );
}
