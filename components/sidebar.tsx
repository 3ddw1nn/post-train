"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./logo";
import { Icon } from "./icons";
import { Dropdown } from "./interactive";
import { UserFooter } from "./avatar-menu";
import { Pill } from "./ui";

type WorkspaceLite = { id: string; name: string };

type NavItem = {
  label: string;
  href: string;
  icon: string;
  match?: string[];
  exclude?: string[];
  badge?: "beta";
  external?: boolean;
};

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Create",
    items: [
      { label: "Studio", href: "/dashboard/content-studio", icon: "sparkles" },
      { label: "Bulk tools", href: "/dashboard/bulk-tools", icon: "stack" },
    ],
  },
  {
    label: "Posts",
    items: [
      { label: "Calendar", href: "/dashboard/posts/calendar", icon: "calendar" },
      {
        label: "All",
        href: "/dashboard/posts",
        icon: "list",
        exclude: ["/dashboard/posts/calendar", "/dashboard/posts/scheduled", "/dashboard/posts/posted", "/dashboard/posts/draft"],
      },
      { label: "Scheduled", href: "/dashboard/posts/scheduled", icon: "clock" },
      { label: "Posted", href: "/dashboard/posts/posted", icon: "send" },
      { label: "Drafts", href: "/dashboard/posts/draft", icon: "file" },
      { label: "Analytics", href: "/dashboard/analytics", icon: "chart", badge: "beta" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Connections", href: "/dashboard/connections", icon: "link" },
      { label: "Teams", href: "/dashboard/teams", icon: "users" },
    ],
  },
  {
    label: "Configuration",
    items: [
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: "gear",
        match: ["/dashboard/settings", "/dashboard/settings/queue"],
        exclude: ["/dashboard/settings/billing", "/dashboard/settings/plans"],
      },
      { label: "API Keys", href: "/dashboard/api-keys", icon: "key" },
      {
        label: "Billing",
        href: "/dashboard/settings/billing",
        icon: "card",
        match: ["/dashboard/settings/billing", "/dashboard/settings/plans"],
      },
    ],
  },
];

function isActive(item: NavItem, path: string): boolean {
  const matches = item.match ?? [item.href];
  if (item.exclude?.some((e) => path === e || path.startsWith(e + "/"))) return false;
  return matches.some((m) => path === m || path.startsWith(m + "/"));
}

function FeedbackItem() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <>
      <button type="button" className="nav-item w-full" onClick={() => setOpen(true)}>
        <Icon name="megaphone" size={16} /> Share feedback
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <p className="py-6 text-center text-sm font-semibold">
                Thanks — we read every note. 💚
              </p>
            ) : (
              <>
                <p className="font-bold">Share feedback</p>
                <textarea
                  className="input mt-3 h-28 resize-none"
                  placeholder="What should we improve?"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button className="btn-subtle" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    disabled={!text.trim()}
                    onClick={async () => {
                      await fetch("/api/app/feedback", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ body: text }),
                      });
                      setSent(true);
                      setTimeout(() => setOpen(false), 1200);
                    }}
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function WorkspaceSwitcher({
  workspaces,
  currentId,
}: {
  workspaces: WorkspaceLite[];
  currentId: string;
}) {
  const router = useRouter();
  const [managing, setManaging] = useState(false);
  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0];

  async function switchTo(id: string) {
    await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  async function createWs() {
    const name = window.prompt("New workspace name");
    if (!name?.trim()) return;
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) await switchTo(data.id);
  }

  return (
    <>
      <Dropdown
        width={230}
        trigger={
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-left text-[13px] font-semibold hover:bg-page"
          >
            <Icon name="home" size={14} className="text-muted" />
            <span className="hidden max-w-[130px] truncate sm:inline">{current?.name}</span>
            <Icon name="chevronsUpDown" size={12} className="text-muted" />
          </button>
        }
      >
        {workspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-page"
            onClick={() => switchTo(w.id)}
          >
            <span className="truncate">{w.name}</span>
            {w.id === currentId && <Icon name="check" size={14} className="text-primary-deep" />}
          </button>
        ))}
        <div className="my-1 h-px bg-line" />
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
          onClick={() => setManaging(true)}
        >
          <Icon name="gear" size={14} /> Manage Workspaces
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
          onClick={createWs}
        >
          <Icon name="plus" size={14} /> New Workspace
        </button>
      </Dropdown>

      {managing && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setManaging(false)}
        >
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">Manage workspaces</p>
            <div className="mt-3 flex flex-col gap-2">
              {workspaces.map((w) => (
                <ManageRow key={w.id} ws={w} isCurrent={w.id === currentId} />
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              <button className="btn-subtle" onClick={createWs}>
                <Icon name="plus" size={14} /> New Workspace
              </button>
              <button className="btn-dark" onClick={() => setManaging(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ManageRow({ ws, isCurrent }: { ws: WorkspaceLite; isCurrent: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(ws.name);
  return (
    <div className="flex items-center gap-2">
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      <button
        className="btn-subtle shrink-0"
        disabled={name.trim() === ws.name || !name.trim()}
        onClick={async () => {
          await fetch(`/api/workspaces/${ws.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          router.refresh();
        }}
      >
        Save
      </button>
      <button
        className="btn-subtle shrink-0 !text-danger"
        title={isCurrent ? "Switch away before deleting" : "Delete workspace"}
        disabled={isCurrent}
        onClick={async () => {
          if (!window.confirm(`Delete workspace “${ws.name}”?`)) return;
          const res = await fetch(`/api/workspaces/${ws.id}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error?.message ?? "Could not delete.");
            return;
          }
          router.refresh();
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

export function Sidebar({
  displayName,
  planLabel,
  workspaces,
  currentWorkspaceId,
  isStaff,
}: {
  displayName: string;
  planLabel: string;
  workspaces: WorkspaceLite[];
  currentWorkspaceId: string;
  isStaff?: boolean;
}) {
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const railNav = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <Link href="/" onClick={() => setDrawerOpen(false)}>
        <Logo size={24} />
      </Link>
      <Link
        href="/dashboard/create"
        className="btn-primary w-full"
        onClick={() => setDrawerOpen(false)}
      >
        <Icon name="plus" size={16} strokeWidth={2.5} /> Create post
      </Link>
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-muted">
            {section.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="nav-item"
                data-active={isActive(item, path)}
                onClick={() => setDrawerOpen(false)}
              >
                <Icon name={item.icon} size={16} />
                <span className="flex-1">{item.label}</span>
                {item.badge === "beta" && (
                  <span title="Beta" className="text-violet-500">
                    <Icon name="flask" size={13} />
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-muted">
          Support
        </p>
        <div className="flex flex-col gap-0.5">
          <FeedbackItem />
          <Link href="/affiliates" className="nav-item" target="_blank">
            <Icon name="gift" size={16} /> Earn 30% referral
          </Link>
          <a href="https://x.com" target="_blank" rel="noreferrer" className="nav-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.06-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.3 17.4Z" />
            </svg>
            Stay updated
          </a>
          <Link href="/growth-guide" className="nav-item" target="_blank">
            <Icon name="book" size={16} /> Growth guide
          </Link>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Sidebar: full height, front layer — brand + nav live here */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[210px] border-r border-line bg-white shadow-[2px_0_8px_rgba(0,0,0,0.03)] lg:block">
        {railNav}
      </aside>

      {/* Content-area bar: starts beside the sidebar (behind it, not over it) — workspace + account only */}
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:left-[210px]">
        <div className="flex items-center gap-3 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            className="btn-subtle !px-2.5"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="list" size={18} />
          </button>
          <Link href="/" className="shrink-0">
            <Logo size={20} />
          </Link>
        </div>
        <WorkspaceSwitcher workspaces={workspaces} currentId={currentWorkspaceId} />
        <div className="ml-auto">
          <UserFooter name={displayName} planLabel={planLabel} isStaff={isStaff} />
        </div>
      </header>

      {/* Mobile drawer: same nav content as the desktop sidebar */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] bg-white shadow-2xl fade-up">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute right-3 top-3 text-muted"
              onClick={() => setDrawerOpen(false)}
            >
              <Icon name="x" size={18} />
            </button>
            {railNav}
          </aside>
        </div>
      )}
    </>
  );
}

export function BetaPill() {
  return <Pill tone="beta">Beta</Pill>;
}
