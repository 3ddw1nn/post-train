# Post Train — Path to Fully Functional

Audit date: 2026-07-18. What's real, what's mocked, and the work remaining. Last updated post-Mastodon OAuth routing fix.

## ✅ Already real (no work needed)

- Auth: email/password, HMAC-signed sessions, password change, sign-out-all
- Google sign-in (live — OAuth app created, credentials set, tested working)
- Convex database (live cloud deployment)
- Media uploads via R2 presigned URLs (bucket wired)
- Scheduling engine: 15s worker tick, queue slots, timezones
- Public API v1, hashed API keys, rate limits, MCP server
- Signed webhooks (HMAC-SHA256)
- Entitlements/plan gates, teams, workspaces
- Marketing site: free tools, blog, docs

---

## 🔴 1. Real social OAuth + publishing (THE product gap)

Currently: `app/oauth/mock/` fake consent form; `lib/publish.ts` `publishToPlatform()`
returns fake post IDs. Nothing actually posts anywhere.

The pipeline around the mock (fan-out, statuses, retries, emails, webhooks) is real —
only the platform adapter needs replacing per platform.

Per platform: register developer app → OAuth flow + token storage/refresh → publish adapter.

- [x] Credentials storage on social_accounts (AES-256-GCM encrypted, stripped from all client-facing queries)
- [x] Twitter/X — REAL. OAuth 2.0 (PKCE) connect flow tested end-to-end (real account connected, real API call attempted).
      Text-only for now — media needs a *second* OAuth 1.0a three-legged flow for the v1.1 media upload endpoint (documented in `lib/twitter.ts`). Blocked on X's new pay-per-credit billing: publish attempt correctly returned `402 credits_depleted` — need to buy API credits in the X dev dashboard before real tweets go out. Token refresh-on-rotation implemented (X rotates the refresh token every use).
      **Deliberately paused** — decided not to spend money on X API credits right now. Everything is built and ready; just add credits in the X dev dashboard whenever ready to see live tweets.
- [x] LinkedIn — REAL. Standard OAuth 2.0 (no PKCE) via "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" products (both instant-approval, no review wait). Profile via `/v2/userinfo`, posting via the UGC Posts API. Connect + real post tested end-to-end (real profile + avatar connected, real post confirmed via `urn:li:share:...`). Text-only for now — media needs LinkedIn's separate assets `registerUpload` flow (same shape gap as Twitter/Mastodon).
- [ ] YouTube — Google Cloud project; videos.insert
- [ ] TikTok — app review takes days; Content Posting API
- [ ] Instagram + Facebook — Meta app review takes weeks; Graph API
- [ ] Threads — Meta Graph API (same app as IG/FB)
- [ ] Pinterest — Pins API
- [x] Bluesky — REAL. App-password sign-in, real posts (text + up to 4 images). Video → clear error (needs Bluesky's separate video pipeline)
- [x] Mastodon — REAL. No developer console at all — dynamically registers an app with the user's instance at connect time (`POST /api/v1/apps`), then standard OAuth. Connect + real post tested end-to-end. Text-only (same media-upload gap as Twitter). Fixed routing in `lib/platforms.ts` to use real OAuth instead of mock handler.
- [x] Replace mock consent screen with real redirect flows; keep mock as dev fallback (Twitter/LinkedIn/Mastodon now routed to real OAuth)
- [ ] Token refresh handling in the worker (mark account `disconnected` on refresh failure)
- [x] Fixed: Twitter connect never fetched/stored `avatar_url` (hardcoded to `null`) — now requests `user.fields=profile_image_url` and swaps X's low-res `_normal` thumbnail for the full-size original
- [x] Fixed: `AccountAvatar` component never accepted or rendered a real avatar image at all — always showed a generated colored-initial placeholder regardless of platform. Now renders the real photo when `avatar_url` is present, across all 9 call sites (Connections, composer, calendar, bulk uploader, connected-account-card)

## 🟠 2. Transactional email — Resend (~1 hour, do first)

Currently: `lib/emails.ts` writes to outbox table + console.log. Password reset
links only appear in the terminal. Nothing is ever sent.

- [x] Brevo account + API key + verified sender (`ehleedev@gmail.com` — swap to a real domain later; Gmail-as-sender hurts deliverability)
- [x] Swap `queueEmail()` body for Brevo API call (call sites unchanged; dev fallback = console log)
- [x] `BREVO_API_KEY` / `EMAIL_FROM` / `EMAIL_FROM_NAME` in `.env.local` — confirmed working (real password-reset email delivered)
- [x] Add `BREVO_API_KEY` etc. to Vercel + Render env vars (worker sends emails too)

## ✅ 3. Stripe billing — REAL, tested end-to-end

`lib/billing.ts` now calls real Stripe. Products/prices live in the "Post Train sandbox"
test-mode account. Verified live: checkout session creation, webhook → Convex sync,
cancel, resume, plan change (with proration), API add-on add/remove. Refund code path
reviewed (single `stripe.refunds.create` call) but not charge-tested — trial subscriptions
generate $0 invoices, so there was no real charge yet to refund against.

- [x] Stripe account (Post Train sandbox), 4 products × monthly+yearly = 8 prices created via CLI
- [x] Real Stripe Checkout Session for new subscribers (`app/checkout/page.tsx` redirects to Stripe-hosted page)
- [x] In-place plan change for existing subscribers (prorated, no new checkout) — `app/api/billing/change-plan`
- [x] Webhook handler (`app/api/webhooks/stripe/route.ts`): `checkout.session.completed`, `customer.subscription.created/updated/deleted` → upserts `subscriptions` via `metadata.user_id` (falls back to `stripe_customer_id` lookup)
- [x] Cancel/resume/pause wired to real Stripe subscription updates
- [x] API add-on wired to real Stripe subscription items (add/swap/remove)
- [x] Refund route → real `stripe.refunds.create` + cancel (code path only, not charge-tested)
- [x] Removed lazy `settle()` roll-forward — webhooks are now the source of truth
- [x] Add `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / price IDs to Vercel env vars
- [ ] In production, replace local `stripe listen` with a real webhook endpoint registered in the Stripe dashboard (currently hitting sandbox)
- [ ] Test a real refund against an actual charge (needs a trial to lapse or a test clock)

## 🟡 4. Real analytics (mostly unblocked by #1)

Currently: `lib/analytics.ts` generates deterministic fake metrics from a hash.
Storage shape, timeframe filters, and API responses are the real contract.

- [ ] TikTok video metrics API (reuse OAuth tokens from #1, add scopes)
- [ ] YouTube Analytics API
- [ ] Instagram Graph insights
- [ ] Replace `seededMetrics()` with per-platform fetchers in `syncAnalytics`

## ✅ 6. Workspace roles + founder staff override — REAL

`workspace_members.role` existed in the schema ("owner" on creation, "member" on
team-invite accept) but nothing ever read it — any workspace member could disconnect
accounts, wipe workspace settings, or delete anyone's posts. Fixed, plus a separate
founder-only override unrelated to any workspace.

- [x] `lib/permissions.ts` — `memberRole`/`canManageWorkspace`/`isWorkspaceOwner`, the
      single source of truth for owner/admin/member checks
- [x] Gated to owner/admin: disconnect/reconnect social accounts, workspace settings
      (webhook/randomize), queue slots CRUD, team creation, API key create
- [x] Post delete: owner/admin, or the post's own creator
- [x] Fixed real bug: API key revoke (`DELETE /api/app/api-keys`) had **zero ownership
      check** — any authenticated user could revoke any workspace's key by id. Now
      verified against the caller's workspace + role.
- [x] Remove-member / change-role (owner/admin only, can't remove or demote the
      workspace owner) — `convex/workspaces.ts` `removeMember`/`changeRole`,
      `app/api/app/teams/members/route.ts`, wired into the Teams page with role badges
- [x] Founder/staff override: `users.is_staff` flag, checked in exactly one place
      (`convex/billing.ts` `getSubscription` returns a synthetic Pro subscription) —
      every entitlement check in the app already flows through that function, so
      nothing else needed touching. Not customer-facing; set directly in the database,
      no self-serve UI. Billing settings page shows a plain "Staff Account" card
      instead of live plan-management buttons for staff users.
- [x] Staff dashboard entry point: "Staff Dashboard" item in the topbar user menu
      (shield icon, staff-only), leading to `/staff` — its own guarded shell
      (`requireStaffUser()`, distinct dark topbar, "Exit Staff Mode" back to
      `/dashboard`). First page: user/workspace lookup (search by email/name, view
      a user's workspaces, role, subscription plan, and connected accounts —
      read-only). Subscription-override tooling and system/worker health are
      deferred until actually needed.

## 🟠 7. Content Studio — real UGC video generation (built, needs API keys)

Currently: all three templates (2x2 Grid, Single Fade-in, AI UGC Creator) render for
real — local ffmpeg compositing + Creatify/fal.ai generation — but nothing has been
deployed or paid for yet. State machine, worker integration, and wizards are built
and verified end-to-end in mock mode; this section is what's left to go live.

- [x] Convex `studio_jobs` table + job state machine (queued → generating →
      compositing → done/failed), leased and resumable across worker restarts
- [x] ffmpeg compositing: 2x2 grid, fade-in + caption overlay (caption is rendered
      to a PNG in the browser via canvas and composited server-side — the installed
      ffmpeg build has no drawtext/freetype), CTA-clip concat
- [x] Creatify client (stock UGC personas) + fal.ai client (custom persona image →
      TTS → Kling AI Avatar v2) — plain fetch, no SDK deps; mock mode when no keys set
- [x] Wizards at `/dashboard/content-studio/<template>`, job status polling, price
      transparency (est. seconds + $ or credits shown before generating), "Create
      post" handoff straight into the composer (`?media=` prefill)
- [x] Per-workspace monthly cap on AI generations (`STUDIO_AI_MONTHLY_CAP` in
      `lib/entitlements.ts`, currently 30/mo — no purchasable add-on yet)
- [x] Verified end-to-end in mock mode (real Convex, zero provider spend) — all
      three templates, validation errors, monthly usage counter
- [ ] Creatify API account — needs a **paid API plan** before real generations
      work; confirm persona-list/lipsync field names against the live API once
      signed up (mapped from docs, not hit live yet)
- [ ] fal.ai account + `FAL_KEY` — pay-as-you-go, no subscription; first real
      generation not yet run
- [ ] Decide before launch: purchasable credit add-ons beyond the flat monthly
      cap (deferred; upgrade path is noted in code)

## 🟠 8. Free hybrid deploy — Vercel (app) + Render (worker) + Convex + R2

Decided 2026-07-18: users hit Vercel (fast, free); the Render free service runs
the same codebase as a pinger-woken background worker (publish + ffmpeg renders,
free CPU). $0/month total; scheduled work may start up to ~5 min late.

- [x] `render.yaml` Blueprint (now sets `WORKER_ENABLED=1`), `GET /api/cron/tick`
      endpoint (timing-safe compare, fails closed without `CRON_SECRET`)
- [x] `lib/worker.ts`: interval gated on `WORKER_ENABLED=1` in production so the
      Vercel app never ticks (double-publish risk — posts have no cross-process
      claim); dev still ticks with zero config
- [x] Render Blueprint deploy created (`post-train`, Docker, free, Oregon) — env
      vars set
- [x] Production Convex deployment (using dev Convex for now — points to `basic-mole-538.convex.cloud`)
- [x] R2 env vars set on both Vercel + Render deployments; CORS policy updated
- [x] `PT_SECRET` set identically on both deployments
- [x] `CRON_SECRET` on Render; tick URL registered with cron-job.org on 5-minute interval
- [x] Vercel: repo imported, app env vars set, `NEXT_PUBLIC_APP_URL` configured,
      OAuth redirect URIs updated in LinkedIn/Twitter/Google dev consoles
- [ ] Smoke test: schedule a post for a few minutes out and confirm the Render worker fires it;
      verify OAuth flows (all platforms tested working locally; Mastodon routing bug now fixed);
      optionally render a Content Studio grid video end-to-end

## 🟢 5. Deferred (fine to skip for launch)

- [ ] Video transcoding — "server video processing" pref is a no-op today; wait until
      a platform actually rejects uploads (then: ffmpeg on the Render worker, or Mux)
- [ ] Webhook retry scanning (`webhook_deliveries.attempts` exists; worker doesn't retry yet)
- [x] R2 token re-scoped to `post-train-media` bucket only (verified: can access the bucket, denied on account-wide ops)

## Env vars — live deployment status

| Var | Status | Notes |
|---|---|---|
| `PT_SECRET` | ✅ Live on Vercel + Render | 64-hex app secret for sessions + credential encryption |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ Live | OAuth tested working end-to-end |
| `BREVO_API_KEY` / `EMAIL_FROM` / `EMAIL_FROM_NAME` | ✅ Live on Vercel + Render | Transactional email verified working |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | ✅ Live on Vercel | Billing live in sandbox |
| `STRIPE_PRICE_{CREATOR,GROWTH,PRO}_{MONTHLY,YEARLY}` / `STRIPE_PRICE_ADDON_{MONTHLY,YEARLY}` | ✅ Live on Vercel | All 8 prices configured |
| `NEXT_PUBLIC_APP_URL` | ✅ Live (post-train.vercel.app) | Checkout + OAuth redirects working |
| `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` / `TWITTER_*` | ✅ Live | OAuth tested; publish paused (no API credits yet) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | ✅ Live | OAuth + publish tested end-to-end |
| `MASTODON_*` | ✅ Dynamic (no keys needed) | Dynamically registers apps per instance; OAuth tested |
| `BLUESKY_*` | ✅ App-password auth (no keys) | Direct authentication; posting tested |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | ✅ Live on Vercel + Render | Media storage active; CORS configured |
| `WORKER_ENABLED` | ✅ Live on Render | Forces background worker; prevents Vercel double-tick |
| `CRON_SECRET` | ✅ Live on Render | Registered with cron-job.org (5-min interval) |
| `CREATIFY_API_ID` / `CREATIFY_API_KEY` | ❌ Blocked | Needs paid Creatify plan signup |
| `FAL_KEY` | ❌ Blocked | Needs fal.ai account signup + API key |
| `STUDIO_MOCK` | Optional | Auto-enabled in dev when no API keys present |
