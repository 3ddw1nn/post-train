"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS } from "@/lib/billing-data";
import { Icon } from "./icons";
import { InfoTip } from "./ui";
import { PlatformIconRow } from "./platform-icon";

const ALL_PLATFORM_IDS = [
  "twitter",
  "instagram",
  "linkedin",
  "facebook",
  "tiktok",
  "youtube",
  "bluesky",
  "threads",
  "pinterest",
  "google_business",
];

export function PlanPicker({
  mode,
  currentPlan,
}: {
  /** checkout → /checkout links (in-app); marketing → /create-account */
  mode: "checkout" | "marketing";
  currentPlan?: string;
}) {
  const [interval, setInterval] = useState<"month" | "year">("year");

  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <div className="relative inline-flex rounded-full border border-line bg-white p-1">
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterval(i)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                interval === i ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {i === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
          <span className="pill absolute -right-3 -top-3 rotate-6 bg-primary text-[#0c2e1a]">
            FREE TRIAL
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => {
          const plan = PLANS[key];
          const monthlyEq = interval === "year" ? plan.yearly / 12 : plan.monthly;
          const dollars = Math.floor(monthlyEq);
          const cents = Math.round((monthlyEq - dollars) * 100);
          const savings = plan.monthly * 12 - plan.yearly;
          const featured = key === "creator";
          const isCurrent = currentPlan === key;
          const href =
            mode === "marketing"
              ? "/create-account"
              : `/checkout?plan=${key}&interval=${interval}`;
          return (
            <div
              key={key}
              className={`card relative flex flex-col p-6 ${
                featured ? "border-2 border-primary shadow-lg" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                {plan.badge && (
                  <span
                    className={`pill ${
                      featured ? "bg-primary text-[#0c2e1a]" : "bg-ink text-white"
                    }`}
                  >
                    {plan.badge}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted">{plan.audience}</p>
              <div className="mt-4 flex items-start gap-1">
                <span className="text-4xl font-extrabold tracking-tight">${dollars}</span>
                {cents > 0 && (
                  <sup className="mt-1.5 text-sm font-bold text-muted">
                    .{String(cents).padStart(2, "0")}
                  </sup>
                )}
                <span className="mt-4 text-sm text-muted">/month</span>
              </div>
              {interval === "year" ? (
                <>
                  <p className="text-sm text-muted">Billed as ${plan.yearly}/year</p>
                  <p className="mt-0.5 text-sm font-semibold text-primary-deep">
                    Save ${savings} — {key === "pro" ? "2 months" : "1 month"} free
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">Billed monthly</p>
              )}
              <ul className="mt-5 flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 text-primary-deep">
                      <Icon name="check" size={15} strokeWidth={2.5} />
                    </span>
                    <span className="flex items-center gap-1.5">
                      {f}
                      {f.includes("accounts") && (
                        <InfoTip text="A social account is one profile/page/channel on a platform. Connect multiple accounts per platform." />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {isCurrent ? (
                  <span className="btn-subtle w-full cursor-default">Current plan</span>
                ) : (
                  <Link href={href} className="btn-primary w-full">
                    Start 7 day free trial →
                  </Link>
                )}
                <p className="mt-2 text-center text-xs text-muted">
                  $0.00 due today, cancel anytime
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
        Post to: <PlatformIconRow ids={ALL_PLATFORM_IDS} size={16} />
      </div>
    </div>
  );
}
