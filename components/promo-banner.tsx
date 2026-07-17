"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { Countdown } from "./interactive";

/** New-user upsell banner: 2 months free on annual Pro, 24h countdown (spec 03). */
export function PromoBanner({ until }: { until: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  if (hidden || new Date(until) <= new Date()) return null;
  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-gradient-to-r from-primary-soft via-white to-blue-50 px-4 py-2.5 pr-10 text-sm">
      <span className="text-primary-deep">
        <Icon name="gift" size={18} />
      </span>
      <span className="font-bold">Welcome aboard — 2 months free on annual Pro</span>
      <span className="pill bg-amber-200 font-mono text-amber-900">
        <Countdown until={until} />
      </span>
      <span className="hidden text-muted md:inline">
        Lock in a year of unlimited accounts at the launch rate.
      </span>
      <Link
        href="/checkout?plan=pro&interval=year"
        className="btn ml-auto bg-primary-dark px-3 !py-1.5 text-white hover:bg-primary-deep"
      >
        Claim offer
      </Link>
      <button
        type="button"
        aria-label="Dismiss offer"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
        onClick={async () => {
          setHidden(true);
          await fetch("/api/app/banner-dismiss", { method: "POST" });
          router.refresh();
        }}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
