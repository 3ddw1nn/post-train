"use client";

import Link from "next/link";
import { Dropdown } from "./interactive";
import { Icon } from "./icons";

export function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary-deep font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

function MenuItems() {
  return (
    <>
      <Link
        href="/dashboard/settings/billing"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
      >
        <Icon name="card" size={15} /> Billing
      </Link>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-danger hover:bg-red-50"
        onClick={() => fetch("/api/auth/signout", { method: "POST" }).then(() => (window.location.href = "/signin"))}
      >
        <Icon name="x" size={15} /> Logout
      </button>
    </>
  );
}

/** Onboarding top-bar avatar menu (Billing + Logout only, per spec). */
export function AvatarMenu({ name }: { name: string }) {
  return (
    <Dropdown
      align="right"
      width={180}
      trigger={
        <button type="button" aria-label="Account menu" className="cursor-pointer">
          <UserAvatar name={name} />
        </button>
      }
    >
      <MenuItems />
    </Dropdown>
  );
}

/** Dashboard sidebar footer: avatar + name + plan label + chevron menu. */
export function UserFooter({ name, planLabel }: { name: string; planLabel: string }) {
  return (
    <Dropdown
      align="left"
      width={190}
      trigger={
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-page"
        >
          <UserAvatar name={name} size={30} />
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13px] font-semibold leading-tight">{name}</span>
            <span className="block text-[11px] text-muted">{planLabel}</span>
          </span>
          <Icon name="chevronsUpDown" size={14} className="text-muted" />
        </button>
      }
    >
      <MenuItems />
    </Dropdown>
  );
}
