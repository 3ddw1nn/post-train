"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, LogoMark } from "./logo";
import { Icon } from "./icons";
import { ActionButton, Dropdown, FormDialog } from "./interactive";
import { UserFooter } from "./avatar-menu";
import { Pill } from "./ui";
import { DevModeButton } from "./dev-mode-button";

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
    label: "Compose",
    items: [
      { label: "Studio", href: "/dashboard/content-studio", icon: "sparkles" },
      { label: "Batch Scheduler", href: "/dashboard/batch-scheduler", icon: "stack" },
      { label: "Tools", href: "/dashboard/tools", icon: "grid" },
    ],
  },
  {
    label: "Posts",
    items: [
      { label: "Calendar", href: "/dashboard/posts/calendar", icon: "calendar" },
      {
        label: "Posts",
        href: "/dashboard/posts",
        icon: "list",
        exclude: ["/dashboard/posts/calendar"],
      },
      { label: "Analytics", href: "/dashboard/analytics", icon: "chart", badge: "beta" },
    ],
  },
  {
    label: "Accounts",
    items: [{ label: "Connections", href: "/dashboard/connections", icon: "link" }],
  },
  {
    label: "Settings",
    items: [
      {
        label: "General",
        href: "/dashboard/settings",
        icon: "gear",
        match: ["/dashboard/settings", "/dashboard/settings/queue"],
        exclude: ["/dashboard/settings/billing", "/dashboard/settings/plans", "/dashboard/settings/workspace"],
      },
      { label: "Workspace", href: "/dashboard/settings/workspace", icon: "users" },
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

const DASHBOARD_PREFETCH_HREFS = [
  "/dashboard/create",
  ...SECTIONS.flatMap((section) => section.items.map((item) => item.href)),
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
        <Icon name="megaphone" size={18} /> Share feedback
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0];

  async function switchTo(id: string) {
    await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  async function createWs(name: string) {
    setCreateError(null);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setCreateError(data?.error?.message ?? "Could not create workspace.");
      return;
    }
    setCreating(false);
    await switchTo(data.id);
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
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" size={14} /> New Workspace
        </button>
      </Dropdown>

      {creating && (
        <FormDialog
          title="New workspace"
          message="Name the workspace you want to switch into."
          fields={[{ name: "name", label: "Workspace name", required: true }]}
          confirmLabel="Create workspace"
          error={createError}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => createWs(values.name)}
        />
      )}

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
              <button className="btn-subtle" onClick={() => setCreating(true)}>
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
      <ActionButton
        endpoint={`/api/workspaces/${ws.id}`}
        method="DELETE"
        className="btn-subtle shrink-0 !text-danger"
        confirmText={`Delete workspace “${ws.name}”?`}
        title={isCurrent ? "Switch away before deleting" : "Delete workspace"}
        disabled={isCurrent}
      >
        <Icon name="trash" size={14} />
      </ActionButton>
    </div>
  );
}

export function Sidebar({
  displayName,
  planLabel,
  workspaces,
  currentWorkspaceId,
  isStaff,
  showDevMode,
}: {
  displayName: string;
  planLabel: string | null;
  workspaces: WorkspaceLite[];
  currentWorkspaceId: string;
  isStaff?: boolean;
  showDevMode?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const activePath = optimisticPath ?? path;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [railCompact, setRailCompact] = useState(false);

  useEffect(() => {
    setOptimisticPath(null);
  }, [path]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("pt_sidebar_collapsed");
      if (raw) setCollapsed(JSON.parse(raw));
      setRailCompact(localStorage.getItem("pt_sidebar_compact") === "true");
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--pt-sidebar-width",
      railCompact ? "72px" : "232px"
    );
    try {
      localStorage.setItem("pt_sidebar_compact", String(railCompact));
    } catch {}
  }, [railCompact]);

  function toggleSection(label: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem("pt_sidebar_collapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    for (const href of DASHBOARD_PREFETCH_HREFS) router.prefetch(href);
  }, [router]);

  function primeRoute(href: string) {
    router.prefetch(href);
  }

  function handleNavIntent(href: string) {
    setOptimisticPath(href);
    setDrawerOpen(false);
    primeRoute(href);
  }

  function handleNavPress(href: string) {
    setOptimisticPath(href);
    primeRoute(href);
  }

  const showCompactRail = railCompact && !drawerOpen;
  const railNav = (
    <nav
      className={`flex h-full flex-col overflow-y-auto ${
        showCompactRail ? "items-center gap-3 px-2.5 py-5" : "gap-4 p-4"
      }`}
    >
      <div
        className={`flex w-full items-center ${
          showCompactRail ? "flex-col justify-center gap-3" : "justify-between"
        }`}
      >
        <Link href="/" onClick={() => setDrawerOpen(false)} aria-label="Post Train home">
          {showCompactRail ? <LogoMark size={30} /> : <Logo size={26} />}
        </Link>
        {!drawerOpen && (
          <button
            type="button"
            aria-label={showCompactRail ? "Expand sidebar" : "Collapse sidebar"}
            title={showCompactRail ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-primary-deep lg:flex"
            onClick={() => setRailCompact((v) => !v)}
          >
            <Icon name="sidebarPanel" size={17} />
          </button>
        )}
      </div>
      <Link
        href="/dashboard/create"
        className={`btn-primary ${showCompactRail ? "h-12 w-12 !rounded-2xl !px-0 !py-0" : "w-full"}`}
        title="Create post"
        onMouseEnter={() => primeRoute("/dashboard/create")}
        onFocus={() => primeRoute("/dashboard/create")}
        onTouchStart={() => primeRoute("/dashboard/create")}
        onPointerDown={() => handleNavPress("/dashboard/create")}
        onClick={() => handleNavIntent("/dashboard/create")}
      >
        <Icon name="plus" size={showCompactRail ? 21 : 16} strokeWidth={2.5} />
        {!showCompactRail && "Create post"}
      </Link>
      {SECTIONS.map((section) => {
        const isCollapsed = !!collapsed[section.label];
        if (showCompactRail) {
          return (
            <div key={section.label} className="flex flex-col items-center gap-1.5">
              {section.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-primary-soft hover:text-primary-deep data-[active=true]:border data-[active=true]:border-line data-[active=true]:bg-white data-[active=true]:text-primary-deep data-[active=true]:shadow-sm"
                  data-active={isActive(item, activePath)}
                  onMouseEnter={() => primeRoute(item.href)}
                  onFocus={() => primeRoute(item.href)}
                  onTouchStart={() => primeRoute(item.href)}
                  onPointerDown={() => handleNavPress(item.href)}
                  onClick={() => handleNavIntent(item.href)}
                >
                  <Icon name={item.icon} size={18} />
                </Link>
              ))}
            </div>
          );
        }
        return (
          <div key={section.label}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-sm font-bold text-muted/70 hover:text-muted"
              aria-expanded={!isCollapsed}
              onClick={() => toggleSection(section.label)}
            >
              {section.label}
              <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} size={15} />
            </button>
            {!isCollapsed && (
              <div className="mt-1 flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="nav-item"
                    data-active={isActive(item, activePath)}
                    onMouseEnter={() => primeRoute(item.href)}
                    onFocus={() => primeRoute(item.href)}
                    onTouchStart={() => primeRoute(item.href)}
                    onPointerDown={() => handleNavPress(item.href)}
                    onClick={() => handleNavIntent(item.href)}
                  >
                    <Icon name={item.icon} size={18} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge === "beta" && (
                      <span title="Beta" className="text-violet-500">
                        <Icon name="flask" size={14} />
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className={`rounded-xl border border-line bg-page/60 p-2 ${showCompactRail ? "hidden" : ""}`}>
        <p className="flex items-center gap-1.5 px-1 pb-1.5 text-sm font-bold text-muted/70">
          <Icon name="info" size={15} /> Need help?
        </p>
        <div className="flex flex-col gap-0.5">
          <FeedbackItem />
          <Link href="/affiliates" className="nav-item" target="_blank">
            <Icon name="gift" size={18} /> Referral discounts
          </Link>
          <Link href="/growth-guide" className="nav-item" target="_blank">
            <Icon name="book" size={18} /> Playbook
          </Link>
          <Link href="/contact" className="nav-item" target="_blank">
            <Icon name="mail" size={18} /> Contact us
          </Link>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Sidebar: full height, front layer — brand + nav live here */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-white shadow-[2px_0_8px_rgba(0,0,0,0.03)] transition-[width] duration-200 lg:block ${
          railCompact ? "w-[72px]" : "w-[232px]"
        }`}
      >
        {railNav}
      </aside>

      {/* Content-area bar: starts beside the sidebar (behind it, not over it) — workspace + account only */}
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:left-[var(--pt-sidebar-width,232px)]">
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
        {showDevMode && <DevModeButton />}
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
