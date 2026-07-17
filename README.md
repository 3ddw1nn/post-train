# Post Train

A social cross-posting and scheduling app: upload content once, publish or schedule it
across 10 platforms (Twitter/X, Instagram, LinkedIn, Facebook, TikTok, YouTube, Bluesky,
Threads, Pinterest, Google Business) from one dashboard.

Built to the specs in [`postbridge-spec/`](postbridge-spec/) — full functional parity
with the reference product, original branding and copy.

## Run it

```bash
pnpm install
pnpm dev           # http://localhost:3000
```

Zero external services required: storage is SQLite via Node's built-in `node:sqlite`
(Node 22.13+/24 required), media lives on disk, and everything writes to `./.data/`
(delete it to reset).

**Try the golden path:** create an account → 3-step onboarding (persona → connect
accounts → pick a plan) → simulated checkout ($0 trial) → land on Billing → hit
"Create post". Instant posts publish within ~15 seconds via the in-process scheduler;
check All/Posted lists, the calendar, and per-platform share links.

## What's real vs. simulated

Everything behavioral is real: auth + sessions, workspaces, the entitlement engine
(trial / cancel-during-trial immediate revoke / paid-cancel-at-period-end / pause /
free-tier 5-post per-destination metering), queue-slot scheduling with timezone math and
±10-min jitter, the publish pipeline (fan-out, independent per-platform results,
posted-if-any-success), HMAC-SHA256 webhooks, analytics storage/serving, teams + invites,
API keys, the public API v1, and an MCP server.

Three seams are simulated so the app runs with zero credentials (each marked with a
`ponytail:` comment at the swap point):

| Seam | Now | Production swap |
|---|---|---|
| Billing | Simulated checkout page mirroring Stripe semantics (`lib/billing.ts`) | Stripe Checkout + lifecycle webhooks into the same `subscriptions` table |
| Platform OAuth | Consent screen at `/oauth/mock/[platform]` | Each platform's real OAuth dialog + callback |
| Publishing | Mock adapter generating share URLs; fails on `needs_reauth` accounts (`lib/publish.ts`) | Real per-platform adapters behind the same signature |

Google OAuth sign-in is real code — set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to
enable the button. Transactional email writes to an `emails_outbox` table + server log.

## Public API v1

Enable the API add-on (Billing) and create a key (API Keys page), then:

```bash
KEY=pt_live_...
curl -H "Authorization: Bearer $KEY" localhost:3000/api/v1/social-accounts
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"caption":"hello","social_accounts":[1,2],"use_queue":true}' \
  localhost:3000/api/v1/posts
```

Full reference at `/docs/api`. The MCP server (11 tools) lives at `/api/mcp/mcp` —
streamable-HTTP, same Bearer key.

## Layout

- `lib/` — domain logic: db schema, auth, entitlements, billing, queue engine, tz math,
  posts, publish pipeline, analytics, API-key auth
- `app/(marketing)/` — landing, 10 platform pages, 10 free tools, blog, MCP/agents
  pages, API docs, legal
- `app/onboarding/` — 3-step wizard (hard-gates the dashboard until checkout)
- `app/dashboard/` — create hub + composer, calendar, post lists, analytics,
  connections, teams, settings (Settings/Queue/Billing/Plans), API keys, studio, bulk
  tools
- `app/api/v1/` — public API · `app/api/app/` — session-authed internal API
- `instrumentation.ts` — starts the 15s publish worker

E2E verification scripts used during development are in the session scratchpad; the
spec's acceptance tests (12-acceptance-tests.md) groups A–I were exercised via HTTP.
