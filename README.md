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

Database state is hosted in Convex. Uploaded media is stored in Cloudflare R2 when
R2 env vars are configured, with local disk fallback for development.

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

## Deploying

This app's scheduled-post worker and Content Studio renders (`lib/worker.ts`,
started from `instrumentation.ts`) ideally run in one always-on Node process. The
database is Convex and media should be Cloudflare R2 in production, so no
persistent volume is required on either host below.

### Deploy on Render (free)

Render's free web services sleep after 15 minutes with no inbound HTTP traffic,
which would delay scheduled posts and studio renders indefinitely. The fix:
an external free pinger hits `GET /api/cron/tick` every ~5 minutes, which both
wakes the service and runs the worker tick directly (`lib/worker.ts`'s
`runWorkerTick()`) — so scheduled items fire within roughly that window instead
of exactly on time.

1. **R2 is required, not optional, on Render free** — its filesystem is ephemeral,
   so without R2 any locally-stored media is wiped on every spin-down or redeploy.
   Set the R2 env vars below.
2. Generate a cron secret: `openssl rand -hex 32` → set as `CRON_SECRET`.
3. In the Render dashboard: **New → Blueprint**, point at this repo (reads
   `render.yaml`), and add your env vars as secrets (`NEXT_PUBLIC_CONVEX_URL`,
   `R2_*`, `STRIPE_*`, `CRON_SECRET`, etc. — same variables as local `.env.local`).
4. Register `https://<your-app>.onrender.com/api/cron/tick?token=<CRON_SECRET>`
   with a free pinger (e.g. [cron-job.org](https://cron-job.org)) on a 5-minute
   interval. Pinging that often keeps the service continuously warm, which stays
   within Render's 750 free instance-hours/month.

### Deploy on Fly.io (always-on, not free)

Posts fire exactly on schedule with no pinger workaround needed — Fly keeps
the process alive continuously (`min_machines_running = 1` in `fly.toml`) for a
small ongoing cost.

```bash
brew install flyctl        # or see fly.io/docs/flyctl/install
fly auth login
fly launch --copy-config --no-deploy   # keep the existing fly.toml when asked
fly deploy
```

## Cloudflare R2 media

Set these environment variables to store uploads in R2:

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL= # optional custom/public bucket domain, no trailing slash
```

Configure the R2 bucket CORS policy to allow browser uploads from your app origin:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Without R2 env vars, uploads fall back to `./.data/media` for local development.

The same `Dockerfile` works on Railway, Render, or any host that runs Docker images.

## Content Studio video generation

The Content Studio templates render server-side with **ffmpeg** (bundled in the
Docker image; `brew install ffmpeg` for local dev). The AI UGC creator uses two
providers, both optional:

```bash
CREATIFY_API_ID=      # stock UGC personas (paid Creatify API plan; 5 credits / 30s video)
CREATIFY_API_KEY=
FAL_KEY=              # custom persona images via fal.ai, pay-as-you-go (~$0.056/s of video)
STUDIO_MOCK=          # "1" forces mock mode; unset = auto-mock in dev when no keys are set
FFMPEG_PATH=          # optional ffmpeg binary override (FFPROBE_PATH likewise)
```

With no provider keys in development the studio runs in **mock mode**: the full
job pipeline executes, but "generation" produces a free local placeholder clip.
AI generations are capped per workspace per month (`STUDIO_AI_MONTHLY_CAP` in
`lib/entitlements.ts`).

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
