# 📋 Post Train — Current Sprint

What's blocking forward progress right now. See `FINISHED.md` for what's shipped; see `PRODUCTION.md` for the final pre-launch checklist.

---

## 🔴 Blocking Development (Do These Next)

### 1. Additional OAuth Platforms (HIGH PRIORITY) — actionable now
- [x] YouTube OAuth + publishing (via Google OAuth, resumable upload API)
- [x] TikTok OAuth + publishing — sandbox working end-to-end
  - [x] OAuth flow implemented (lib/tiktok.ts)
  - [x] Content Posting API integrated (lib/tiktok-publish.ts)
  - [x] Sandbox Client Key: `sbaw5b6zwxk0pxxjdl` / Secret: `OXAZgbWEiEC67Ic1fLdLZxRpTmto7REu` (in .env.local + Vercel env)
  - [x] Verified working on post-train.vercel.app (fixed v1→v2 endpoint migration + corrected client secret OCR typo `I` vs `l`)
  - Production credentials (unused until submission): Client Key `awd23ukbqt8z67b6` / Secret `YgezWUwkxCH4rqS7QoNHwbKbRBqF8GnL`
  - Production submission itself is blocked on a domain — see 🚧 Blocked section below
- [x] TikTok: Fixed publish flow to match TikTok's real Content Posting API
  - **Finding:** There's no `post_mode` toggle for TikTok videos — draft vs. direct are two separate endpoints requiring two different OAuth scopes:
    - `/v2/post/publish/inbox/video/init/` (draft, to inbox) — needs `video.upload` scope — **this is what we have**
    - `/v2/post/publish/video/init/` (direct to profile) — needs `video.publish` scope, which requires a separate, stricter TikTok content-posting audit (privacy-level selector, duet/stitch/comment UI, creator info shown before posting — none of which we've built)
  - [x] Rewrote lib/tiktok-publish.ts to call the real v2 inbox/draft endpoint (previous code called retired v1-style endpoints that would 404 — same class of bug as the OAuth fix)
  - [x] Removed caption/cover-timestamp/AIGC fields from the composer's TikTok config panel — none apply in inbox/draft mode (TikTok ignores them; the creator sets caption/cover themselves in-app)
  - [x] Composer now shows an info note explaining videos land as a draft in the TikTok inbox
  - **Decision (2026-07-19): draft-to-inbox ships for launch; direct-post is a post-launch upgrade.** Draft mode already works end-to-end and needs nothing further from TikTok. Direct-post (`video.publish` scope) requires building a consent screen (username/photo shown pre-post, public/friends/private picker, duet/stitch/comment toggles) and passing TikTok's separate content-posting audit (2-4 weeks, submission-based review — TikTok watches a demo video + reads an explanation, doesn't log into the live app). Not worth delaying launch for. Revisit in the Lower Priority backlog after launch — see §11.
- **Why:** Expands platform coverage before launch; each platform brings new users

### 1b. 🚧 Blocked Platforms / Waiting on External Dependencies
Nothing to build here yet — revisit when the blocker clears.

- **TikTok production submission** — blocked on acquiring a custom domain (currently on post-train.vercel.app)
  - [ ] Update redirect URI in TikTok dashboard to real domain
  - [ ] Update TIKTOK_CLIENT_ID & TIKTOK_CLIENT_SECRET with production credentials
  - **Basic Info:** App Name "Post Train" · App Icon logo-mark-1024.png · Category "Social Networking" · Description "Social media scheduler. Schedule and publish content across TikTok and other platforms from one dashboard." · ToS https://post-train.vercel.app/tos · Privacy https://post-train.vercel.app/privacy-policy · Platform: Web
  - **Products & Scopes:** Login Kit + Content Posting API · `video.upload`, `user.info.basic`
  - **App Review explanation (ready to paste):**
    ```
    Post Train is a social media scheduler that integrates with TikTok's Content Posting API. Users connect their TikTok account via OAuth, then compose and schedule video content to publish directly to TikTok from our dashboard.

    The integration uses the following scopes:
    - video.upload: to upload and publish videos
    - user.info.basic: to retrieve basic profile information

    The end-to-end flow: user logs in with TikTok OAuth → authorizes Post Train → selects or uploads a video → adds caption → publishes to TikTok as a draft (user can publish manually from TikTok).
    ```
  - [ ] Record demo video (<50MB mp4/mov, shows OAuth → compose → publish flow)
  - [ ] Submit for app review (2-5 days approval) once domain is live
  - [ ] Add `TIKTOK_CLIENT_ID` and `TIKTOK_CLIENT_SECRET` to Vercel & Render production env vars

- **Facebook OAuth + publishing** (Meta app + Graph API) — blocked: current Facebook account pending deletion (2026-07-24)
  - Plan: create a new Facebook account after the 24th, then create the Meta Developer app there
  - **Why Facebook first (once unblocked):** Simpler than Instagram — just needs a Facebook Page (no Business/Creator account conversion or IG-Page linking required), fewer permissions (`pages_manage_posts`, `pages_read_engagement`). Validates the Meta app + OAuth flow before tackling Instagram's extra setup.
  - [ ] Create Meta Developer app at developers.facebook.com
  - [ ] Get App ID / App Secret, add to .env.local + Vercel
  - [ ] Implement OAuth flow (lib/facebook.ts) — Facebook Login, Page access token
  - [ ] Implement publishing (lib/facebook-publish.ts) — post to Page via Graph API
  - [ ] Wire into lib/platforms.ts + lib/publish.ts (same pattern as YouTube/Pinterest/TikTok)
  - [ ] Submit for Meta app review (`pages_manage_posts` is a restricted permission)

- **Instagram OAuth + publishing** (reuse Meta app from Facebook) — blocked: same Meta account issue as Facebook
  - Requires: IG Business/Creator account linked to a Facebook Page

- **Threads publishing** (Meta Graph API, same app) — blocked: same Meta account issue

- **Pinterest OAuth + publishing** (Pins API v5, text+image pins) — blocked: waiting for trial approval email
  - [x] App created, App ID: 1591939
  - [ ] Receive Pinterest trial approval email (24-48 hours)
  - [ ] Get App Secret from Pinterest dashboard
  - [ ] Add `PINTEREST_CLIENT_SECRET` to .env.local, Vercel, Render

### 2. Real Analytics (MEDIUM PRIORITY)
- [ ] TikTok: Wire OAuth scope + `videos.list` endpoint for metrics
- [ ] YouTube: Analytics API (requires Google Cloud project)
- [ ] Instagram: Graph API insights endpoint
- [ ] Replace `seededMetrics()` mock with per-platform fetchers in `syncAnalytics`
- **Why:** Post-publish visibility; users expect to see how their content performs

---

## 🚨 Pre-Production Mandatory (Required Before Launch)

**These must be completed and tested before shipping to production.**

### 3. Domain + DNS (PRODUCTION.md #1)
- [ ] Buy domain (post-train.com, posttrain.app, etc.)
- [ ] Point DNS to Vercel
- [ ] Update `NEXT_PUBLIC_APP_URL` on Vercel
- [ ] Update all OAuth redirect URIs in external dashboards (Google, LinkedIn, Twitter)
- [ ] Update Stripe webhook endpoint

### 4. Stripe → Production (PRODUCTION.md #2)
- [ ] Create production Stripe account or flip to live mode
- [ ] Recreate products + 8 prices
- [ ] Update secret keys on Vercel
- [ ] Register webhook endpoint
- [ ] Test full checkout flow with real card

### 5. Convex → Production (PRODUCTION.md #5)
- [ ] Run `npx convex deploy` to go live
- [ ] Update deployment URL on Vercel + Render
- [ ] Re-set support-chat AI keys

### 6. Email domain (PRODUCTION.md #6)
- [ ] Move from `ehleedev@gmail.com` to `noreply@yourdomain.com`
- [ ] Add SPF/DKIM/DMARC records
- [ ] Update `EMAIL_FROM` on Vercel + Render

---

## 🟡 Lower Priority (Nice to Have)

### 8. Content Studio with real providers (optional for MVP)
- [ ] Creatify: Sign up for paid API plan, set `CREATIFY_API_ID`/`CREATIFY_API_KEY` on Vercel + Render
- [ ] fal.ai: Create account, get `FAL_KEY`, set on both deployments
- [ ] Generate one real video (any template) and verify it lands in media library
- [ ] "Create post" from finished job → publish to a connected account

### 9. Twitter/X credits (optional — pause is in place)
- [ ] Buy API credits in X Developer Portal
- [ ] Verify tweet publishing works

### 11. Google Business Profile OAuth + publishing (pushed far back)
- Not just an OAuth integration — the API only exists to manage a real, public Google Maps/Search business listing. Requires creating and verifying an actual GBP listing (name, address, category), then waiting 60+ days verified before even applying for API access.
- [ ] Create the Google Business Profile listing at google.com/business
- [ ] Complete verification (postcard/phone/email/video) — starts the 60-day clock
- [ ] Note verification date here once confirmed: `_____`
- [ ] Once 60+ days verified + website attached: submit GBP API access request ("Application for Basic API Access")
- [ ] After approval: enable Business Profile APIs in Google Cloud Console (same project as YouTube OAuth), implement lib/google-business.ts + publishing
- Note: Post Train already uses Google OAuth for YouTube — same Google Cloud project can likely add the Business Profile API scope

### 12. TikTok direct-post (video.publish scope) — post-launch upgrade
- Draft-to-inbox (current behavior) already works and needs nothing further; this is a pure upgrade, not a fix
- **What it takes:**
  - [ ] Request `video.publish` scope in the OAuth flow (lib/tiktok.ts) alongside existing `video.upload`
  - [ ] Build a pre-post consent screen: show the connected TikTok username/photo, a public/friends-only/private picker (options must match `privacy_level_options` from `/v2/post/publish/creator_info/query/`), and duet/stitch/comment toggles
  - [ ] Implement `/v2/post/publish/video/init/` (direct-post endpoint) in lib/tiktok-publish.ts, alongside the existing inbox/draft path
  - [ ] Add a per-post or per-account toggle so users choose draft vs. direct
  - [ ] Record a new demo video showing the consent screen + direct-post flow
  - [ ] Submit for TikTok's content-posting audit (2-4 weeks, submission-based — TikTok reviews the demo video + written explanation, does not log into the live app)
  - [ ] Until approved, posts using `video.publish` are forced private (`SELF_ONLY`) — safe to test, not safe to advertise as working
- **Why post-launch:** No launch-blocking dependency relies on this; draft mode covers the core use case today

---

## 🟢 Testing (Optional, Do Later)

### 10. End-to-end smoke test (testing only, not blocking)
- [x] Sign up on Vercel (post-train.vercel.app)
- [x] Connect a social account (Mastodon or Bluesky recommended — easiest, no external config)
- [ ] Schedule a post for 5 minutes from now
- [ ] Watch the Render worker logs; confirm the post publishes when the tick fires
- [ ] Verify the post appears on the platform
- **Why:** Validates the full stack works; done after OAuth platforms are ready

---

## 🛠️ Known Bugs / Technical Debt

- None currently blocking. See past sections in `TODO.md` git history for what was fixed.

---

## Deployment Status

| Service | Status | Notes |
|---|---|---|
| Vercel (App) | ✅ Live | post-train.vercel.app; Mastodon OAuth routing bug fixed |
| Render (Worker) | ✅ Live | Free tier; pinger active (cron-job.org) |
| Convex (DB) | ✅ Connected | Currently using dev deployment; migrate to prod before launch |
| R2 (Media) | ✅ Live | CORS configured; scoped token in use |
| Brevo (Email) | ✅ Live | Verified working; consider custom domain |
| Stripe (Billing) | ✅ Sandbox | Upgrade to production before launch |
