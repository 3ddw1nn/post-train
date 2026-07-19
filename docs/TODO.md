# 📋 Post Train — Current Sprint

What's blocking forward progress right now. See `FINISHED.md` for what's shipped; see `PRODUCTION.md` for the final pre-launch checklist.

---

## 🔴 Actionable High Priority (Do These Next)

### 1. Rebrand every page — differentiate UI from the Post Bridge template

Post Train started from the Post Bridge template; the goal is a UI that reads as its own product on every screen, not just the composer. **This is a layout/structure pass, not a color pass** — the teal palette (PRODUCT.md tokens) stays as-is. The problem is structural sameness: same card grids, same badge/pill placement, same information architecture per section as Post Bridge. Fix by changing composition (grid → list, stacked → split, card → row) while keeping colors and design tokens untouched.

- [x] Create post page (composer) — done
- [x] Content Studio (dashboard/content-studio) — done (2026-07-19): template section changed from a 3-up card grid to a horizontal row list (icon left, content middle, action right); hero banner restructured to content-left/CTA-right; dropped emoji-badge vanity stats (🔥/📊 view counts) that mirrored Post Bridge's copy almost verbatim; lock indicator changed from a circular orange badge to a neutral square chip

**Dashboard — core**

- [ ] Posts list (dashboard/posts)
- [ ] Draft posts (dashboard/posts/draft)
- [ ] Scheduled posts (dashboard/posts/scheduled)
- [ ] Posted (dashboard/posts/posted)
- [ ] Calendar view (dashboard/posts/calendar)
- [ ] Connections (dashboard/connections)
- [ ] Analytics (dashboard/analytics)

**Dashboard — secondary**

- [ ] Content Studio hub (dashboard/content-studio)
- [ ] Content Studio wizard (dashboard/content-studio/[template])
- [ ] Bulk tools hub (dashboard/bulk-tools)
- [ ] Bulk creation (dashboard/bulk-tools/creation)
- [ ] Bulk images (dashboard/bulk-tools/images)
- [ ] Bulk videos (dashboard/bulk-tools/videos)
- [ ] Settings (dashboard/settings)
- [ ] Billing settings (dashboard/settings/billing)
- [ ] Plans settings (dashboard/settings/plans)
- [ ] Queue settings (dashboard/settings/queue)
- [ ] Teams (dashboard/teams)
- [ ] API keys (dashboard/api-keys)

**Onboarding & auth**

- [ ] Sign in (signin)
- [ ] Create account (create-account)
- [ ] Reset password (reset-password)
- [ ] Onboarding start (onboarding/start)
- [ ] Onboarding connect (onboarding/connect)
- [ ] Onboarding connect/add (onboarding/connect/add)
- [ ] Onboarding plans (onboarding/plans)
- [ ] Checkout (checkout)

**Marketing / public**

- [x] Homepage ((marketing)/page.tsx)
- [ ] Platform landing pages ((marketing)/[platform] — /twitter-x, /instagram, etc.)
- [ ] Pricing (pricing)
- [ ] Affiliates (affiliates)
- [ ] Agents (agents)
- [ ] Blog index (blog)
- [ ] Blog post (blog/[slug])
- [ ] API docs (docs/api)
- [ ] Growth guide (growth-guide)
- [ ] MCP page (mcp)
- [ ] Privacy policy (privacy-policy)
- [ ] Terms of Service (tos)
- [ ] Tools index (tools)
- [ ] Tool page (tools/[tool])

**Staff / internal** (lower urgency — not user-facing)

- [x] Staff home (staff)
- [x] Staff leads (staff/leads)

- **Why:** A UI that still visibly reads as the source template undercuts trust and brand identity before launch.

---



## 🚧 Blocked / Waiting on External Dependencies

Nothing to build here yet — revisit when the blocker clears.

- **TikTok production submission** — blocked on acquiring a custom domain (currently on post-train.vercel.app)
  - [ ] Update redirect URI in TikTok dashboard to real domain
  - [ ] Update TIKTOK_CLIENT_ID & TIKTOK_CLIENT_SECRET with production credentials
  - **Basic Info:** App Name "Post Train" · App Icon logo-mark-1024.png · Category "Social Networking" · Description "Social media scheduler. Schedule and publish content across TikTok and other platforms from one dashboard." · ToS [https://post-train.vercel.app/tos](https://post-train.vercel.app/tos) · Privacy [https://post-train.vercel.app/privacy-policy](https://post-train.vercel.app/privacy-policy) · Platform: Web
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

---



## 🚀 Post-Launch (deliberately deferred, not forgotten)



### TikTok direct-post (video.publish scope)

Draft-to-inbox (current, live behavior) already works and needs nothing further — this is a pure upgrade, not a fix.

- **One connection, not two.** TikTok scopes are individually grantable within a single OAuth request — `video.upload` + `video.publish` are requested together in the same "Connect TikTok" flow, one account row, no duplicate connect button.
- **Prebuilt ahead of time (2026-07-19), inert until activated:**
  - [x] `fetchTikTokCreatorInfo()` in lib/tiktok-publish.ts — queries `/v2/post/publish/creator_info/query/` for username/avatar + this creator's allowed privacy levels
  - [x] `publishToTikTokDirect()` in lib/tiktok-publish.ts — implements the real `/v2/post/publish/video/init/` endpoint
  - [x] Neither function is wired into lib/publish.ts yet — zero risk to the working draft flow
  - [x] Composer UI: disabled "Post directly to profile — Coming soon" toggle + "Draft" badge on the TikTok account chip
- **Remaining work to activate:**
  - [ ] Add `video.publish` product/scope to the TikTok Developer Portal app (production + sandbox)
  - [ ] Add `video.publish` to `SCOPES` in lib/tiktok.ts once the portal side is confirmed
  - [ ] Build the pre-post consent screen: TikTok username/photo, public/friends-only/private picker (matching that creator's `privacyLevelOptions`), duet/stitch/comment toggles
  - [ ] Wire `publishToTikTokDirect()` into lib/publish.ts, gated behind the composer toggle
  - [ ] Enable the composer toggle once the consent screen exists
  - [ ] Record a demo video showing the consent screen + direct-post flow, submit for TikTok's content-posting audit (2-4 weeks)
  - [ ] Until approved, `video.publish` posts are forced private (`SELF_ONLY`)
- **Why post-launch:** No launch-blocking dependency relies on this; draft mode covers the core use case today



### Google Business Profile OAuth + publishing

- Not just an OAuth integration — the API only exists to manage a real, public Google Maps/Search business listing. Requires creating and verifying an actual GBP listing (name, address, category), then waiting 60+ days verified before even applying for API access.

- [ ] Create the Google Business Profile listing at google.com/business
- [ ] Complete verification (postcard/phone/email/video) — starts the 60-day clock
- [ ] Note verification date here once confirmed: `_____`
- [ ] Once 60+ days verified + website attached: submit GBP API access request ("Application for Basic API Access")
- [ ] After approval: enable Business Profile APIs in Google Cloud Console (same project as YouTube OAuth), implement lib/google-business.ts + publishing

- Note: Post Train already uses Google OAuth for YouTube — same Google Cloud project can likely add the Business Profile API scope



### Real Analytics

- [ ] TikTok: Wire OAuth scope + `videos.list` endpoint for metrics
- [ ] YouTube: Analytics API (requires Google Cloud project)
- [ ] Instagram: Graph API insights endpoint
- [ ] Replace `seededMetrics()` mock with per-platform fetchers in `syncAnalytics`

- **Why post-launch:** Depends on platforms (Instagram) that are themselves blocked; not launch-critical

---



## 🚨 Pre-Production Mandatory (Required Before Launch)

**These must be completed and tested before shipping to production.**

### 2. Domain + DNS (PRODUCTION.md #1)

- [ ] Buy domain (post-train.com, posttrain.app, etc.)
- [ ] Point DNS to Vercel
- [ ] Update `NEXT_PUBLIC_APP_URL` on Vercel
- [ ] Update all OAuth redirect URIs in external dashboards (Google, LinkedIn, Twitter)
- [ ] Update Stripe webhook endpoint



### 3. Stripe → Production (PRODUCTION.md #2)

- [ ] Create production Stripe account or flip to live mode
- [ ] Recreate products + 8 prices
- [ ] Update secret keys on Vercel
- [ ] Register webhook endpoint
- [ ] Test full checkout flow with real card



### 4. Convex → Production (PRODUCTION.md #5)

- [ ] Run `npx convex deploy` to go live
- [ ] Update deployment URL on Vercel + Render
- [ ] Re-set support-chat AI keys



### 5. Email domain (PRODUCTION.md #6)

- [ ] Move from `ehleedev@gmail.com` to `noreply@yourdomain.com`
- [ ] Add SPF/DKIM/DMARC records
- [ ] Update `EMAIL_FROM` on Vercel + Render

---



## 🟡 Lower Priority (Nice to Have)



### 6. Content Studio with real providers (optional for MVP)

- [ ] Creatify: Sign up for paid API plan, set `CREATIFY_API_ID`/`CREATIFY_API_KEY` on Vercel + Render
- [ ] fal.ai: Create account, get `FAL_KEY`, set on both deployments
- [ ] Generate one real video (any template) and verify it lands in media library
- [ ] "Create post" from finished job → publish to a connected account



### 7. Twitter/X credits (optional — pause is in place)

- [ ] Buy API credits in X Developer Portal
- [ ] Verify tweet publishing works

---



## 🟢 Testing (Optional, Do Later)



### 8. End-to-end smoke test (testing only, not blocking)

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


| Service          | Status      | Notes                                                         |
| ---------------- | ----------- | ------------------------------------------------------------- |
| Vercel (App)     | ✅ Live      | post-train.vercel.app; Mastodon OAuth routing bug fixed       |
| Render (Worker)  | ✅ Live      | Free tier; pinger active (cron-job.org)                       |
| Convex (DB)      | ✅ Connected | Currently using dev deployment; migrate to prod before launch |
| R2 (Media)       | ✅ Live      | CORS configured; scoped token in use                          |
| Brevo (Email)    | ✅ Live      | Verified working; consider custom domain                      |
| Stripe (Billing) | ✅ Sandbox   | Upgrade to production before launch                           |


