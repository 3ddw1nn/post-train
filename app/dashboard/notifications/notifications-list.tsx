"use client";

// The full notification history. The bell panel shows the most recent few;
// this is where you go to actually work through them.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { StatusIcon, relativeTime, type NotificationItem } from "@/components/notifications";

const TYPE_LABEL: Record<string, string> = {
  studio_render: "Studio",
  post_publish: "Publishing",
  batch_schedule: "Batch Scheduler",
  account: "Account",
  storage: "Storage",
};

export function NotificationsList({ initial }: { initial: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unread = items.filter((item) => !item.read_at).length;
  const visible = filter === "unread" ? items.filter((item) => !item.read_at) : items;

  function dismiss(item: NotificationItem) {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    void fetch(`/api/app/notifications/${item.id}`, { method: "DELETE" }).catch(() => undefined);
  }

  function open(item: NotificationItem) {
    if (!item.read_at) {
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry)),
      );
      void fetch(`/api/app/notifications/${item.id}`, { method: "PATCH" }).catch(() => undefined);
    }
    if (item.href) router.push(item.href);
  }

  function markAllRead() {
    const stamp = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? stamp })));
    void fetch("/api/app/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    }).catch(() => undefined);
  }

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-muted">Renders, publishing, storage, and account activity.</p>
        </div>
        {unread > 0 && (
          <button type="button" className="btn-subtle" onClick={markAllRead}>
            <Icon name="check" size={15} /> Mark all read
          </button>
        )}
      </div>

      <div className="mt-5 inline-flex rounded-[10px] border border-line bg-white p-0.5">
        {(
          [
            ["all", "All", items.length],
            ["unread", "Unread", unread],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
              filter === key ? "bg-primary text-primary-contrast" : "text-muted hover:text-ink"
            }`}
          >
            {label}
            <span className={filter === key ? "opacity-80" : "opacity-70"}>{count}</span>
          </button>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden p-0">
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-page text-muted">
              <Icon name="bell" size={22} />
            </span>
            <p className="mt-3 text-lg font-bold">
              {filter === "unread" ? "Nothing unread" : "All quiet for now"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {filter === "unread"
                ? "You're caught up. Switch to All to see everything from the past few days."
                : "Render, publishing, storage, and account updates will show up here."}
            </p>
          </div>
        ) : (
          visible.map((item) => (
            <div
              key={item.id}
              className={`group flex items-start gap-3 border-b border-line/70 px-5 py-4 last:border-0 hover:bg-page ${
                !item.read_at ? "bg-primary-soft/25" : ""
              }`}
            >
              <StatusIcon status={item.status} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(item)}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-ink">{item.title}</span>
                  <span className="pill bg-gray-100 text-gray-600">{TYPE_LABEL[item.type] ?? item.type}</span>
                  {!item.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted">{item.message}</span>
                <span className="mt-1 block text-xs font-medium text-muted">{relativeTime(item.updated_at)}</span>
              </button>
              <button
                type="button"
                aria-label={`Dismiss: ${item.title}`}
                className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition-opacity hover:bg-line/60 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => dismiss(item)}
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        Showing your most recent activity.{" "}
        <Link href="/dashboard/settings" className="font-semibold text-primary-deep hover:underline">
          Email notification settings
        </Link>
      </p>
    </div>
  );
}
