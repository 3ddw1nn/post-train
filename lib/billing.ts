// Simulated billing service mirroring Stripe subscription semantics.
// ponytail: this is the Stripe seam — swap startCheckout/confirmCheckout/cancel/pause/etc.
// for real Stripe Checkout sessions + webhook upserts; the subscriptions table already
// mirrors the Stripe fields (status, cancel_at_period_end, trial/period ends).
import { getDb, now, uid } from "./db";
import { PLANS, API_ADDON, TRIAL_DAYS } from "./billing-data";

export { PLANS, API_ADDON, TRIAL_DAYS };

export type Plan = "free" | "creator" | "growth" | "pro";
export type Subscription = {
  id: string;
  user_id: string;
  plan: Plan;
  interval: "month" | "year";
  status: "trialing" | "active" | "past_due" | "canceled" | "paused";
  cancel_at_period_end: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  api_addon: number;
  api_addon_interval: string | null;
  created_at: string;
  updated_at: string;
};

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400_000);
const addMonths = (d: Date, months: number) => {
  const c = new Date(d);
  c.setMonth(c.getMonth() + months);
  return c;
};

export function getSubscription(userId: string): Subscription | null {
  const sub = getDb()
    .prepare("SELECT * FROM subscriptions WHERE user_id = ?")
    .get(userId) as Subscription | undefined;
  if (!sub) return null;
  return settle(sub);
}

/** Lazily roll subscription state forward (stands in for Stripe lifecycle webhooks). */
function settle(sub: Subscription): Subscription {
  const db = getDb();
  const ts = new Date();
  let changed = false;
  if (sub.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at) <= ts) {
    if (sub.cancel_at_period_end) {
      sub.status = "canceled";
    } else {
      sub.status = "active"; // simulated successful first charge
    }
    changed = true;
  }
  if (
    sub.status === "active" &&
    sub.cancel_at_period_end &&
    sub.current_period_end &&
    new Date(sub.current_period_end) <= ts
  ) {
    sub.status = "canceled";
    changed = true;
  }
  if (changed) {
    db.prepare("UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?").run(
      sub.status,
      now(),
      sub.id
    );
  }
  return sub;
}

/** Called on return from (simulated) checkout. Creates/updates the subscription with a 7-day trial. */
export function confirmCheckout(userId: string, plan: Exclude<Plan, "free">, interval: "month" | "year") {
  const db = getDb();
  const ts = new Date();
  const existing = db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ?")
    .get(userId) as Subscription | undefined;
  const periodEnd = interval === "year" ? addMonths(ts, 12) : addMonths(ts, 1);
  if (existing && ["trialing", "active"].includes(existing.status) && !existing.cancel_at_period_end) {
    // plan change on a live subscription: keep status, swap plan/interval
    db.prepare(
      "UPDATE subscriptions SET plan = ?, interval = ?, updated_at = ? WHERE id = ?"
    ).run(plan, interval, now(), existing.id);
  } else if (existing) {
    // re-subscribe after cancel/pause: fresh trial-less activation
    db.prepare(
      `UPDATE subscriptions SET plan = ?, interval = ?, status = 'active', cancel_at_period_end = 0,
       trial_ends_at = NULL, current_period_end = ?, updated_at = ? WHERE id = ?`
    ).run(plan, interval, periodEnd.toISOString(), now(), existing.id);
  } else {
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, interval, status, trial_ends_at, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'trialing', ?, ?, ?, ?)`
    ).run(
      uid(),
      userId,
      plan,
      interval,
      addDays(ts, TRIAL_DAYS).toISOString(),
      periodEnd.toISOString(),
      now(),
      now()
    );
  }
  db.prepare(
    "UPDATE users SET first_subscribed_at = COALESCE(first_subscribed_at, ?) WHERE id = ?"
  ).run(now(), userId);
}

export function cancelSubscription(userId: string) {
  getDb()
    .prepare(
      "UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = ? WHERE user_id = ?"
    )
    .run(now(), userId);
}

export function pauseSubscription(userId: string) {
  getDb()
    .prepare("UPDATE subscriptions SET status = 'paused', updated_at = ? WHERE user_id = ?")
    .run(now(), userId);
}

export function resumeSubscription(userId: string) {
  getDb()
    .prepare(
      "UPDATE subscriptions SET status = 'active', cancel_at_period_end = 0, updated_at = ? WHERE user_id = ?"
    )
    .run(now(), userId);
}

export function setApiAddon(userId: string, on: boolean, interval: "month" | "year" = "year") {
  getDb()
    .prepare(
      "UPDATE subscriptions SET api_addon = ?, api_addon_interval = ?, updated_at = ? WHERE user_id = ?"
    )
    .run(on ? 1 : 0, on ? interval : null, now(), userId);
}
