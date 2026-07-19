# 📋 Post Train — Current Sprint

What's blocking forward progress right now. See `FINISHED.md` for what's shipped; see `PRODUCTION.md` for the final pre-launch checklist.

---

## 🔴 Blocking Development (Do These Next)

### 1. Additional OAuth Platforms (HIGH PRIORITY)
- [x] YouTube OAuth + publishing (via Google OAuth, resumable upload API)
- [x] TikTok OAuth + publishing (code done, app review pending)
  - [x] OAuth flow implemented (lib/tiktok.ts)
  - [x] Content Posting API integrated (lib/tiktok-publish.ts)
  - [🔴 HIGH PRIORITY] Add publish mode toggle (DRAFT vs. DIRECT POST)
    - **What:** Users choose how their TikTok content publishes:
      - **Option A (Draft):** Video uploads to TikTok drafts → user reviews & manually publishes from TikTok app
      - **Option B (Direct):** Video publishes straight to user's feed at scheduled time (no review needed)
    - [ ] Update lib/tiktok-publish.ts to support both `post_mode: "DRAFT"` and `post_mode: "PUBLISH_NOW"`
    - [ ] Add mode parameter to publishToTikTok(creds, video, caption, mode) function
    - [ ] Update lib/publish.ts to pass the mode when calling publishToTikTok()
    - [ ] Add toggle in Composer UI: "Publish as draft" radio / "Publish directly" radio (default: draft)
    - [ ] Store user's choice per post (or as account default)
    - **Why:** Core scheduler value — users want both options depending on content type
  - [x] TikTok Developer Portal app created
    - **Production Credentials:**
      - Client Key: `awd23ukbqt8z67b6`
      - Client Secret: `YgezWUwkxCH4rqS7QoNHwbKbRBqF8GnL`
    - [x] **Sandbox Setup (for testing before production)**
      - [x] Sandbox app created on TikTok Developer Portal
      - [x] Sandbox Client Key: `sbaw5b6zwxk0pxxjdl` (in .env.local + Vercel env)
      - [x] Sandbox Client Secret: `OXAZgbWEiEC67lc1fLdLZxRpTmto7REu` (in .env.local + Vercel env)
      - [x] Redirect URI configured: `http://localhost:3000/api/oauth/tiktok/callback` (local) + `https://post-train.vercel.app/api/oauth/tiktok/callback` (production)
      - [x] Test account authorized in sandbox
      - [ ] Test OAuth flow on post-train.vercel.app (once Vercel redeploy completes)
    - [ ] **Implement publish mode toggle** (DRAFT vs. DIRECT POST) — see HIGH PRIORITY section above
    - [ ] **Production submission** — Once real domain acquired:
      - [ ] Update redirect URI in TikTok dashboard to real domain
      - [ ] Update TIKTOK_CLIENT_ID & TIKTOK_CLIENT_SECRET with production credentials
      - [ ] Record demo video + submit for app review (2-5 days)
    - **Basic Info:**
      - [ ] App Name: Post Train
      - [ ] App Icon: logo-mark-1024.png (resized)
      - [ ] Category: Social Networking
      - [ ] Description: "Social media scheduler. Schedule and publish content across TikTok and other platforms from one dashboard."
      - [ ] Terms of Service URL: https://post-train.vercel.app/tos
      - [ ] Privacy Policy URL: https://post-train.vercel.app/privacy-policy
      - [ ] Platforms: Web
    - **Products & Scopes:**
      - [ ] Products: Login Kit + Content Posting API
      - [ ] Scopes: `video.upload`, `user.info.basic`
    - **App Review:**
      - [ ] Explanation text written:
        ```
        Post Train is a social media scheduler that integrates with TikTok's Content Posting API. Users connect their TikTok account via OAuth, then compose and schedule video content to publish directly to TikTok from our dashboard.
        
        The integration uses the following scopes:
        - video.upload: to upload and publish videos
        - user.info.basic: to retrieve basic profile information
        
        The end-to-end flow: user logs in with TikTok OAuth → authorizes Post Train → selects or uploads a video → adds caption → publishes to TikTok as a draft (user can publish manually from TikTok).
        ```
      - [ ] Demo video: recorded and uploaded (shows OAuth → compose → publish flow, <50MB mp4/mov)
      - [ ] Submit for review — **BLOCKED: Need custom domain first** (currently on post-train.vercel.app)
  - [ ] Once domain acquired: update OAuth redirect URI in TikTok dashboard to `https://yourdomain.com/api/oauth/tiktok/callback`
  - [ ] Submit for review (2-5 days approval)
  - [ ] Add `TIKTOK_CLIENT_ID` and `TIKTOK_CLIENT_SECRET` to Vercel & Render env vars (already in .env.local)
- [ ] Instagram OAuth + publishing (Meta app review + Graph API)
- [ ] Facebook publishing (reuse Meta app from Instagram)
- [ ] Threads publishing (Meta Graph API, same app)
- [~] Pinterest OAuth + publishing (Pins API v5, text+image pins) — **WAITING FOR TRIAL APPROVAL**
  - [x] App created, App ID: 1591939
  - [ ] Receive Pinterest trial approval email (24-48 hours)
  - [ ] Get App Secret from Pinterest dashboard
  - [ ] Add `PINTEREST_CLIENT_SECRET` to .env.local, Vercel, Render
- **Why:** Expands platform coverage before launch; each platform brings new users
- **Next:** Submit TikTok for review; while waiting, start Instagram

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
