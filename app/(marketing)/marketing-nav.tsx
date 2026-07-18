"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { Dropdown, Countdown } from "@/components/interactive";
import { AvatarMenu } from "@/components/avatar-menu";

type NavUser = { name: string; isStaff: boolean };

const LINKS = [
  { label: "Pricing", href: "/#pricing" },
  { label: "Reviews", href: "/#reviews" },
  { label: "Features", href: "/#features" },
  { label: "Platforms", href: "/#platforms" },
  { label: "FAQ", href: "/#faq" },
  { label: "Blog", href: "/blog" },
];

export function MarketingNav({ user }: { user: NavUser | null }) {
  const [open, setOpen] = useState(false);
  const [promo, setPromo] = useState(false);
  const promoEnd = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // next Sunday
    d.setHours(23, 59, 59, 0);
    return d.toISOString();
  })();

  useEffect(() => {
    setPromo(localStorage.getItem("pt_promo_dismissed") !== "1");
  }, []);

  return (
    <>
      {promo && (
        <div className="relative bg-primary-dark px-4 py-2 text-center text-sm font-semibold text-white">
          🚂 Launch week: 20% off any plan with code{" "}
          <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono">ALLABOARD</code> ·{" "}
          <Countdown until={promoEnd} className="font-mono text-primary" />
          <button
            type="button"
            aria-label="Dismiss promo"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
            onClick={() => {
              setPromo(false);
              localStorage.setItem("pt_promo_dismissed", "1");
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-50 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/">
            <Logo size={36} />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold lg:flex">
            {LINKS.map((l) => (
              <Link key={l.label} href={l.href} className="text-ink/80 hover:text-ink">
                {l.label}
              </Link>
            ))}
            <Dropdown
              width={190}
              trigger={
                <button type="button" className="flex items-center gap-1 text-ink/80 hover:text-ink">
                  Tools <Icon name="chevronDown" size={13} />
                </button>
              }
            >
              <Link href="/tools" className="block px-3 py-2 text-sm font-medium hover:bg-page">
                Free Tools
              </Link>
              <Link href="/growth-guide" className="block px-3 py-2 text-sm font-medium hover:bg-page">
                Growth Guide
              </Link>
            </Dropdown>
            <Link href="/docs/api" className="text-ink/80 hover:text-ink">
              API
            </Link>
            <Link href="/dashboard/settings/billing" className="text-ink/80 hover:text-ink">
              Billing
            </Link>
            {user ? (
              <>
                <Link href="/dashboard/create" className="btn-primary !py-1.5">
                  Dashboard
                </Link>
                <AvatarMenu name={user.name} isStaff={user.isStaff} />
              </>
            ) : (
              <>
                <Link href="/signin" className="btn-subtle !py-1.5">
                  Login
                </Link>
                <Link href="/create-account" className="btn-primary !py-1.5">
                  Try it for free
                </Link>
              </>
            )}
          </nav>
          <div className="lg:hidden">
            <button
              type="button"
              className="btn-subtle !px-2.5"
              aria-label="Open main menu"
              onClick={() => setOpen(true)}
            >
              <Icon name="list" size={18} />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-[60] bg-white p-6 lg:hidden">
          <div className="flex items-center justify-between">
            <Logo size={32} />
            <button
              type="button"
              aria-label="Close menu"
              className="btn-subtle !px-2.5"
              onClick={() => setOpen(false)}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
          <nav className="mt-8 flex flex-col gap-4 text-lg font-semibold">
            {LINKS.map((l) => (
              <Link key={l.label} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <Link href="/tools" onClick={() => setOpen(false)}>Free Tools</Link>
            <Link href="/growth-guide" onClick={() => setOpen(false)}>Growth Guide</Link>
            <Link href="/docs/api" onClick={() => setOpen(false)}>API</Link>
            {user ? (
              <>
                <Link href="/dashboard/settings/billing" onClick={() => setOpen(false)}>Billing</Link>
                {user.isStaff && (
                  <Link href="/staff" onClick={() => setOpen(false)}>Staff Dashboard</Link>
                )}
                <button
                  type="button"
                  className="text-left text-danger"
                  onClick={() => fetch("/api/auth/signout", { method: "POST" }).then(() => (window.location.href = "/signin"))}
                >
                  Logout
                </button>
                <Link href="/dashboard/create" className="btn-primary mt-2 w-full" onClick={() => setOpen(false)}>
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link href="/signin" onClick={() => setOpen(false)}>Login</Link>
                <Link href="/create-account" className="btn-primary mt-2 w-full" onClick={() => setOpen(false)}>
                  Try it for free
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
