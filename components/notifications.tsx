"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

export type NotificationItem = {
  id: string;
  type: string;
  status: "processing" | "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  href: string | null;
  read_at: string | null;
  toast_shown_at: string | null;
  created_at: string;
  updated_at: string;
};

const tone = {
  processing: { icon: "refresh", iconClass: "text-primary-deep", shell: "bg-primary-soft" },
  success: { icon: "check", iconClass: "text-primary-deep", shell: "bg-primary-soft" },
  warning: { icon: "warningTriangle", iconClass: "text-amber-700", shell: "bg-amber-50" },
  error: { icon: "warningTriangle", iconClass: "text-danger", shell: "bg-red-50" },
  info: { icon: "info", iconClass: "text-primary-deep", shell: "bg-primary-soft" },
} as const;

export function relativeTime(value: string) {
  const elapsed = Date.now() - Date.parse(value);
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function StatusIcon({ status, size = 16 }: { status: NotificationItem["status"]; size?: number }) {
  const style = tone[status];
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.shell} ${style.iconClass}`}>
      <Icon name={style.icon} size={size} className={status === "processing" ? "animate-spin" : undefined} />
    </span>
  );
}

export function Notifications() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const shownThisSession = useRef(new Set<string>());
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/app/notifications", { cache: "no-store" });
      // A 500 is not a reason to keep spinning: bailing out here without
      // marking the load finished left the panel on its skeleton forever,
      // which is exactly what a backend outage looked like from the outside.
      if (!response.ok) {
        setLoaded(true);
        setLoadError(true);
        return;
      }
      const payload = (await response.json()) as { data?: NotificationItem[] };
      const next = payload.data ?? [];
      setItems(next);
      setLoaded(true);
      setLoadError(false);
      if (document.visibilityState !== "visible") return;
      const fresh = next.filter((item) => !item.toast_shown_at && !shownThisSession.current.has(`${item.id}:${item.updated_at}`)).slice(0, 3);
      if (fresh.length > 0) {
        fresh.forEach((item) => shownThisSession.current.add(`${item.id}:${item.updated_at}`));
        // The set only guards against re-toasting within one page life; cap it
        // so a long session can't grow it without bound.
        if (shownThisSession.current.size > 200) shownThisSession.current.clear();
        setToasts((current) => [...fresh, ...current].slice(0, 3));
        void fetch("/api/app/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_toasts_shown", items: fresh.map((item) => ({ id: item.id, updated_at: item.updated_at })) }),
        });
      }
    } catch {
      setLoaded(true);
      setLoadError(true);
    }
  }, []);

  const working = items.some((item) => item.status === "processing");

  /**
   * Poll fast only while something is actually running, and not at all while
   * the tab is hidden.
   *
   * The previous fixed 5s interval ran for every signed-in user forever, which
   * is ~17k requests a day each to learn nothing. A render is the only thing
   * worth watching closely, and it announces itself with a `processing` row.
   */
  useEffect(() => {
    let timer = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") await load();
      if (stopped) return;
      timer = window.setTimeout(tick, working ? 4000 : 45_000);
    };
    void tick();
    // A tab coming back to the foreground should refresh immediately rather
    // than showing stale counts until the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, working]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("button")?.focus());
  }, [open]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((item) => window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== item.id || toast.updated_at !== item.updated_at)),
      item.status === "error" ? 10_000 : 6500,
    ));
    return () => timers.forEach(window.clearTimeout);
  }, [toasts]);

  const unread = items.filter((item) => !item.read_at).length;

  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    await fetch("/api/app/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    }).catch(() => undefined);
  }

  function dismiss(item: NotificationItem) {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setToasts((current) => current.filter((toast) => toast.id !== item.id));
    void fetch(`/api/app/notifications/${item.id}`, { method: "DELETE" }).catch(() => undefined);
  }

  async function openItem(item: NotificationItem) {
    setOpen(false);
    setToasts((current) => current.filter((toast) => toast.id !== item.id || toast.updated_at !== item.updated_at));
    if (!item.read_at) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
      void fetch(`/api/app/notifications/${item.id}`, { method: "PATCH" });
    }
    if (item.href) router.push(item.href);
  }

  return (
    <>
      <div className="relative" ref={root}>
        <button
          type="button"
          ref={trigger}
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}${working ? ", work in progress" : ""}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls="notifications-panel"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink/75 transition-colors hover:bg-page hover:text-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="bell" size={18} />
          {/* A spinner beats a count while work is in flight: "something is
              still running" is the question people open this for. */}
          {working && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </span>
          )}
          {unread > 0 && !working && (
            <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {open && (
          <section ref={panel} id="notifications-panel" className="absolute right-0 top-11 z-50 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white shadow-[0_14px_40px_rgba(6,63,59,0.16)]" aria-label="Notifications">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="font-bold">Notifications</h2>
                <p className="text-xs text-muted">Renders, publishing, and account activity</p>
              </div>
              {unread > 0 && <button type="button" className="text-xs font-semibold text-primary-deep hover:underline" onClick={() => void markAllRead()}>Mark all read</button>}
            </div>
            <div className="max-h-[min(32rem,70vh)] overflow-y-auto">
              {!loaded ? (
                <div className="space-y-3 p-4" aria-label="Loading notifications"><div className="skeleton-shimmer h-14 rounded-lg" /><div className="skeleton-shimmer h-14 rounded-lg" /></div>
              ) : loadError && items.length === 0 ? (
                <div className="px-6 py-9 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-danger"><Icon name="warningTriangle" size={18} /></span>
                  <p className="mt-3 text-sm font-bold">Couldn’t load notifications</p>
                  <button type="button" className="mt-2 text-xs font-semibold text-primary-deep hover:underline" onClick={() => void load()}>Try again</button>
                </div>
              ) : items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-page text-muted"><Icon name="bell" size={19} /></span>
                  <p className="mt-3 text-sm font-bold">All quiet for now</p>
                  <p className="mt-1 text-xs text-muted">Render and publishing updates will show up here.</p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className={`group relative flex items-start border-b border-line/70 last:border-0 hover:bg-page ${!item.read_at ? "bg-primary-soft/25" : ""}`}>
                    <button type="button" className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-left" onClick={() => void openItem(item)}>
                      <StatusIcon status={item.status} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2"><span className="min-w-0 flex-1 text-sm font-bold text-ink">{item.title}</span>{!item.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted">{item.message}</span>
                        <span className="mt-1 block text-[11px] font-medium text-muted">{relativeTime(item.updated_at)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss: ${item.title}`}
                      className="mr-2 mt-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={() => dismiss(item)}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-line px-4 py-2.5 text-center text-xs font-bold text-primary-deep transition-colors hover:bg-page"
            >
              See all notifications
            </Link>
          </section>
        )}
      </div>

      <div className="pointer-events-none fixed right-4 top-[calc(3.5rem+0.75rem)] z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-atomic="false">
        {toasts.map((item) => (
          <div key={`${item.id}:${item.updated_at}`} className="pointer-events-auto flex gap-3 rounded-xl border border-line bg-white p-3.5 shadow-[0_12px_36px_rgba(6,63,59,0.18)] fade-up">
            <StatusIcon status={item.status} />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openItem(item)}>
              <span className="block text-sm font-bold">{item.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">{item.message}</span>
            </button>
            <button type="button" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-page hover:text-ink" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((toast) => toast.id !== item.id || toast.updated_at !== item.updated_at))}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
