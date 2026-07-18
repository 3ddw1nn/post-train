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

### Free hybrid: Vercel (app) + Render (worker) + Convex + R2

The recommended $0 deploy. Users only ever touch the Vercel deployment (fast,
no cold starts); the Render free service runs the same codebase purely as the
background worker — publishing scheduled posts and running ffmpeg studio
renders — woken every ~5 minutes by a free external pinger. Render's free-tier
sleep never affects users because nobody visits its URL; it only means
scheduled work can start up to ~5 minutes late.

Shared requirements:

- **R2 is required** (not optional): Vercel and Render can't share a disk, and
  both filesystems are ephemeral. All media must live in R2 — set the R2 vars
  on **both** deployments, and add both domains to the bucket CORS policy.
- **`PT_SECRET` must be identical on both** deployments — the app encrypts
  social-account credentials with it and the worker decrypts them.
- Both deployments point at the same production Convex deployment
  (`npx convex deploy`, then use its URL as `NEXT_PUBLIC_CONVEX_URL`).

Steps:

1. **Vercel** (serves the app): import the GitHub repo at vercel.com, framework
   auto-detects Next.js. Set all app env vars (`NEXT_PUBLIC_CONVEX_URL`, `R2_*`,
   `STRIPE_*`, OAuth creds, `BREVO_*`, `PT_SECRET`). Do **not** set
   `WORKER_ENABLED` — the Vercel app must not tick (double-publish risk).
2. **Render** (worker): **New → Blueprint** on this repo (reads `render.yaml`,
   which sets `WORKER_ENABLED=1`). Set the same env vars plus `CRON_SECRET`
   (`openssl rand -hex 32`).
3. Register `https://<render-app>.onrender.com/api/cron/tick?token=<CRON_SECRET>`
   with a free pinger (e.g. [cron-job.org](https://cron-job.org)) on a 5-minute
   interval — this wakes the worker and runs the tick. That cadence keeps the
   service warm within Render's 750 free instance-hours/month.
4. Point `NEXT_PUBLIC_APP_URL`, OAuth redirect URIs (LinkedIn/Twitter dev
   consoles too), and the Stripe webhook endpoint at the **Vercel** domain.

### Alternative: any always-on Docker host

The same `Dockerfile` runs on any host that keeps one container alive
continuously (Fly.io, Railway, a VPS). Set `WORKER_ENABLED=1` there and posts
fire exactly on schedule with no pinger needed — for whatever that host charges.

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
