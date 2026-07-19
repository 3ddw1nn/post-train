# 📋 Post Train — Current Sprint

What's blocking forward progress right now. See `FINISHED.md` for what's shipped; see `PRODUCTION.md` for the final pre-launch checklist.

---

## 🔴 Blocking (Do These Next)

### 1. End-to-end smoke test
- [ ] Sign up on Vercel (post-train.vercel.app)
- [ ] Connect a social account (Mastodon or Bluesky recommended — easiest, no external config)
- [ ] Schedule a post for 5 minutes from now
- [ ] Watch the Render worker logs; confirm the post publishes when the tick fires
- [ ] Verify the post appears on the platform
- **Outcome**: Proves the hybrid deployment (Vercel + Render + Convex + R2) works end-to-end

### 2. Content Studio with real providers (optional for MVP)
- [ ] Creatify: Sign up for paid API plan, set `CREATIFY_API_ID`/`CREATIFY_API_KEY` on Vercel + Render
- [ ] fal.ai: Create account, get `FAL_KEY`, set on both deployments
- [ ] Generate one real video (any template) and verify it lands in media library
- [ ] "Create post" from finished job → publish to a connected account

---

## 🟡 High Priority (Do Before Launch)

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

## 🟢 Lower Priority (Ship Without If Needed)

### 7. Twitter/X credits (optional — pause is in place)
- [ ] Buy API credits in X Developer Portal
- [ ] Verify tweet publishing works

### 8. Analytics (deferred)
- [ ] TikTok video metrics API
- [ ] YouTube Analytics API
- [ ] Instagram Graph insights

### 9. Additional OAuth platforms (not for MVP)
- [ ] YouTube
- [ ] TikTok
- [ ] Instagram + Facebook
- [ ] Threads
- [ ] Pinterest

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
