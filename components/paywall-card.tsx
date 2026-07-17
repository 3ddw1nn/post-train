import Link from "next/link";
import { Icon } from "./icons";

/** Shown on create routes without an active subscription/free credits (spec 03 D13). */
export function PaywallCard() {
  return (
    <div className="flex justify-center py-16">
      <div className="card w-full max-w-md p-8 text-center">
        <h2 className="text-xl font-bold">No active subscription</h2>
        <p className="mt-1 text-sm text-muted">You need to subscribe to create posts.</p>
        <div className="mt-5 rounded-xl bg-primary-soft p-4 text-left">
          <p className="text-sm font-bold text-primary-dark">Subscribe to unlock…</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-primary-dark">
            {[
              "Unlimited posts across every platform",
              "Multiple accounts per platform",
              "Premium features — studio, bulk tools & analytics",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-0.5">
                  <Icon name="check" size={14} strokeWidth={3} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <Link href="/dashboard/settings/plans" className="btn-primary mt-5 w-full">
          Subscribe now
        </Link>
      </div>
    </div>
  );
}
