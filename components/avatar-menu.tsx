"use client";

import Link from "next/link";
import { Dropdown } from "./interactive";
import { Icon } from "./icons";
import { Pill } from "./ui";

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

function MenuItems({ isStaff }: { isStaff?: boolean }) {
  return (
    <>
      {isStaff && (
        <Link
          href="/staff"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
        >
          <Icon name="shield" size={15} /> Staff Dashboard
        </Link>
      )}
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

/** Compact avatar-only account menu (Billing + Logout, Staff Dashboard if staff). */
export function AvatarMenu({ name, isStaff }: { name: string; isStaff?: boolean }) {
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
      <MenuItems isStaff={isStaff} />
    </Dropdown>
  );
}

/** Dashboard top-bar user menu: avatar + name + plan pill + chevron (collapses on mobile). */
export function UserFooter({
  name,
  planLabel,
  isStaff,
}: {
  name: string;
  planLabel: string;
  isStaff?: boolean;
}) {
  const isFree = planLabel.startsWith("Free");
  return (
    <Dropdown
      align="right"
      width={200}
      trigger={
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-page"
        >
          <UserAvatar name={name} size={28} />
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[120px] truncate text-[13px] font-semibold leading-tight">
              {name}
            </span>
            <span className="mt-0.5 block">
              <Pill tone={isFree ? "neutral" : "success"}>{planLabel}</Pill>
            </span>
          </span>
          <Icon name="chevronsUpDown" size={13} className="hidden text-muted sm:block" />
        </button>
      }
    >
      <MenuItems isStaff={isStaff} />
    </Dropdown>
  );
}
