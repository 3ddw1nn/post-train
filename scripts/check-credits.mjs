// Check for AI UGC credit pricing — run with `npm run check:credits`.
//
// Same idiom as check-media-filters.mjs: no test runner, just the npm script
// compiling the dependency-light module and asserting on the output.
//
// What it's really guarding is margin. AI UGC is the only feature that spends
// real provider money per click ($0.025/sec of Replicate output), and it used
// to be sold as a flat 30 renders/month on every plan — which at the 600-char
// script ceiling cost more than the plan was worth. Two properties have to
// hold or that comes back: a render's price must track its LENGTH, and a
// plan's included credits must stay inside its COGS budget.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const E = require("../node_modules/.cache/checks/lib/entitlements.js");
let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra && !cond ? " — " + extra : ""}`); };

// Mirrors lib/studio.ts's estimateAiUgcCost: ~15 chars/sec of speech, 5-60s.
const secondsFor = (chars) => Math.min(60, Math.max(5, Math.round(chars / 15)));
const sub = (plan, status = "active") => ({ plan, status, cancel_at_period_end: 0 });

// ── Length-based pricing — the whole point of credits over "1 render" ──────
ok("5s floor costs 1 credit", E.creditsForSeconds(secondsFor(1)) === 1, String(E.creditsForSeconds(secondsFor(1))));
ok("~15s costs 3 credits", E.creditsForSeconds(secondsFor(225)) === 3, String(E.creditsForSeconds(secondsFor(225))));
ok("600-char max costs 8 credits", E.creditsForSeconds(secondsFor(600)) === 8, String(E.creditsForSeconds(secondsFor(600))));
ok("a max-length script costs 8x a minimum one",
  E.creditsForSeconds(secondsFor(600)) === 8 * E.creditsForSeconds(secondsFor(1)));
ok("never free — a 1s render still costs a credit", E.creditsForSeconds(1) === 1);
ok("partial credits round up (11s -> 3, not 2)", E.creditsForSeconds(11) === 3, String(E.creditsForSeconds(11)));

// ── Allowances ─────────────────────────────────────────────────────────────
ok("free plan gets nothing", E.studioAiMonthlyCredits(null) === 0);
ok("unentitled (canceled) gets nothing", E.studioAiMonthlyCredits(sub("pro", "canceled")) === 0);
ok("creator < growth < pro",
  E.studioAiMonthlyCredits(sub("creator")) < E.studioAiMonthlyCredits(sub("growth")) &&
  E.studioAiMonthlyCredits(sub("growth")) < E.studioAiMonthlyCredits(sub("pro")));

// A 7-day trial must not be able to spend a full month of provider budget.
for (const plan of ["creator", "growth", "pro"]) {
  ok(`${plan} trial is clamped below its paid allowance`,
    E.studioAiMonthlyCredits(sub(plan, "trialing")) <= 20 &&
    E.studioAiMonthlyCredits(sub(plan, "trialing")) < E.studioAiMonthlyCredits(sub(plan)));
}

// ── The margin invariant that motivated all of this ────────────────────────
// 1 credit = SECONDS_PER_CREDIT seconds of Replicate output at $0.025/sec.
// If someone later raises an allowance past its COGS budget, this fails loudly.
const USD_PER_CREDIT = E.SECONDS_PER_CREDIT * 0.025;
const PRICE = { creator: 28, growth: 48, pro: 98 };
const MAX_COGS_SHARE = 0.3;
for (const [plan, price] of Object.entries(PRICE)) {
  const worst = E.studioAiMonthlyCredits(sub(plan)) * USD_PER_CREDIT;
  ok(`${plan}: AI COGS $${worst.toFixed(2)} stays under ${MAX_COGS_SHARE * 100}% of $${price}`,
    worst <= price * MAX_COGS_SHARE, `$${worst.toFixed(2)} of $${price}`);
}

// Regression on the original bug: the old flat 30 renders at the 40s ceiling
// was 30 * 8 = 240 credits ($30). No plan may quietly drift back to that.
ok("no plan is as generous as the old unsustainable flat cap",
  ["creator", "growth", "pro"].every((p) => E.studioAiMonthlyCredits(sub(p)) < 240));

// ── Credit top-up packs ────────────────────────────────────────────────────
const { CREDIT_PACKS } = require("../node_modules/.cache/checks/lib/billing-data.js");
ok("packs exist", Array.isArray(CREDIT_PACKS) && CREDIT_PACKS.length > 0);
ok("pack ids are unique", new Set(CREDIT_PACKS.map((p) => p.id)).size === CREDIT_PACKS.length);

for (const pack of CREDIT_PACKS) {
  const cogs = pack.credits * USD_PER_CREDIT;
  // A pack sold at or below provider cost loses money on every purchase.
  ok(`pack "${pack.id}" sells above cost (\$${pack.price} vs \$${cogs.toFixed(2)} cost)`,
    pack.price > cogs, `$${pack.price} vs $${cogs.toFixed(2)}`);
  ok(`pack "${pack.id}" keeps at least a 2x markup`,
    pack.price >= cogs * 2, `$${pack.price} vs $${(cogs * 2).toFixed(2)} floor`);
}

// Bigger packs must not cost MORE per credit than smaller ones, or the pricing
// table punishes the customers spending the most.
const perCredit = CREDIT_PACKS.map((p) => ({ id: p.id, rate: p.price / p.credits }));
const sortedBySize = [...CREDIT_PACKS].sort((a, b) => a.credits - b.credits);
ok("per-credit price never increases with pack size",
  sortedBySize.every((p, i) => i === 0 || p.price / p.credits <= sortedBySize[i - 1].price / sortedBySize[i - 1].credits),
  JSON.stringify(perCredit));

// Where top-ups sit against the marginal cost of upgrading a plan. Upgrading
// Creator->Growth buys +40 credits for +$20, and Growth->Pro +100 for +$50, so
// the marginal plan rate is $0.50/credit. This is NOT asserted as a hard rule
// (a plan also buys accounts, storage and workspaces, so its price can't be
// attributed to credits alone) — it's reported so a repricing makes the
// upgrade-vs-top-up tradeoff visible instead of accidental.
const cheapestPackRate = Math.min(...perCredit.map((p) => p.rate));
const MARGINAL_PLAN_RATE = 0.5;
console.log(
  `NOTE  cheapest top-up $${cheapestPackRate.toFixed(3)}/credit vs $${MARGINAL_PLAN_RATE.toFixed(2)}/credit to upgrade` +
  ` — top-ups currently ${cheapestPackRate < MARGINAL_PLAN_RATE ? "UNDERCUT upgrading" : "cost more than upgrading"}`,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
