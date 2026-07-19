# ✅ Post Train — Completed Milestones

These features and infrastructure pieces are shipped and tested end-to-end.

## Authentication & Core Infrastructure

- Email/password auth with HMAC-signed sessions
- Password reset, change password, sign-out-all
- Google OAuth sign-in (live, tested)
- Convex database (cloud deployment active)
- Public API v1 with hashed keys and rate limiting
- MCP server integration
- Signed webhooks (HMAC-SHA256)
- Workspace roles + member management
- Team invitations and workspace switching
- Workspace owner/member permissions

## Social Platforms — Real OAuth & Publishing

- **Twitter/X** — OAuth 2.0 PKCE flow, real post publishing (paused: needs API credits)
- **LinkedIn** — OAuth 2.0 OpenID, real post publishing (tested end-to-end)
- **Mastodon** — Dynamic app registration, real OAuth, real post publishing (tested; routing bug fixed)
- **Bluesky** — App-password auth, real post publishing (tested, up to 4 images)
- **Google Account** — OAuth + profile sign-in (verified working)
- **YouTube** — Google OAuth, resumable upload API, real post publishing (tested end-to-end)
- **TikTok** — OAuth 2.0 (v2 endpoints), Content Posting API draft-to-inbox upload (sandbox verified end-to-end on post-train.vercel.app; production submission pending a custom domain). Direct-to-profile publishing deliberately deferred post-launch — see TODO.md.

## Media & Storage

- R2 bucket integration (Cloudflare)
- Presigned upload URLs
- Local-disk fallback for development
- Media library with metadata persistence

## Scheduling & Publishing Engine

- 15-second worker tick (production: Render; dev: in-process)
- Queue slots with timezone-aware scheduling
- Retry logic with exponential backoff
- Post status tracking (draft/scheduled/posted/failed)
- Webhook delivery logging
- Email notifications on publish/failure

## Billing & Entitlements

- Stripe integration (sandbox mode)
- 4 product tiers × 2 billing cycles = 8 prices
- Checkout flow (Stripe-hosted)
- Plan switching with proration
- Cancel/resume/pause subscriptions
- API add-on purchasing
- Webhook sync (checkout, subscription lifecycle)
- Refund code path (untested charge)
- Staff override for founder testing

## Content Studio — Video Generation

- Convex `studio_jobs` state machine (queued → generating → compositing → done/failed)
- FFmpeg compositing (local CPU):
  - 2×2 grid render
  - Fade-in + caption overlay (canvas → PNG → composite)
  - CTA clip concatenation
- Creatify API client (stock UGC personas, mock mode when no keys)
- fal.ai client (custom image → TTS → Avatar, mock mode when no keys)
- Wizards for all three templates
- Job status polling UI
- Price transparency (seconds + $ estimated before generation)
- Monthly generation cap per workspace (30/mo AI, uncapped grid/fade-in)
- "Create post" handoff to composer

## Transactional Email

- Brevo API integration (verified working)
- Password reset delivery
- Email domain verified (`ehleedev@gmail.com`)
- Worker-triggered emails (not just HTTP handlers)

## Deployment & DevOps

- Vercel app deployment (post-train.vercel.app, auto-redeploy from git)
- Render Blueprint (free tier worker, WORKER_ENABLED=1 gate)
- Docker containerization (Alpine + ffmpeg)
- Environment variable management (Vercel + Render)
- External cron pinger (cron-job.org, 5-min interval)
- Cross-deployment secrets (PT_SECRET, CRON_SECRET)

## UX Polish

- Scrollbar hiding (Firefox + webkit)
- Staff dashboard entry point (shield icon, separate mode)
- Account avatars (real photos, not generated placeholders)
- Connected account display with reauth badges
- Dark UI mode (topbar theming for staff)

## Developer Experience

- Mock OAuth consent screen (for platforms without real keys)
- Mock analytics (deterministic fake metrics)
- Dev fallback for email (console.log)
- Mock social posting (fake IDs, real workflow)
- Convex local dev + hot reload
- Proper error messages and logging
