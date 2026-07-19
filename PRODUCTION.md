# 🚀 Production Launch Checklist

Final items to ship Post Train to production. These are in order of dependency.

## 1. Domain & DNS Setup

- [ ] Purchase production domain (post-train.com, posttrain.app, etc.)
- [ ] Configure DNS records (A/CNAME for Vercel)
- [ ] Verify domain in Vercel dashboard
- [ ] Set `NEXT_PUBLIC_APP_URL=https://yourdomain.com` on Vercel
- [ ] Update all OAuth redirect URIs in external consoles:
  - [ ] Google Cloud Console (`yourdomain.com/api/auth/google/callback`)
  - [ ] LinkedIn app dashboard (`yourdomain.com/api/oauth/linkedin/callback`)
  - [ ] Twitter/X app dashboard (`yourdomain.com/api/oauth/twitter/callback`)
  - [ ] Stripe Dashboard (webhook endpoint: `yourdomain.com/api/webhooks/stripe`)
- [ ] Update email sender domain in Brevo (improve deliverability; currently using Gmail)

## 2. Stripe → Production (not sandbox)

- [ ] Create new Stripe account or flip existing sandbox to production
- [ ] Recreate products (Creator, Growth, Pro) with production pricing
- [ ] Recreate 8 price IDs (monthly + yearly per tier)
- [ ] Create API add-on price (monthly + yearly, if offered)
- [ ] Set `STRIPE_SECRET_KEY` (production) on Vercel
- [ ] Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (production)
- [ ] Register real webhook endpoint (not `stripe listen`; use Vercel domain)
- [ ] Test full checkout → subscription → invoice flow with real card
- [ ] Verify webhook delivery (Stripe Dashboard → Events)

## 3. Twitter/X API Credits (Optional Launch Blocker)

- [ ] Buy API credits in X Developer Portal
- [ ] Verify tweet publishing works (currently paused: `402 credits_depleted`)
- [ ] Test text + media publish if credits allow

## 4. Content Studio Providers (Optional Launch Blocker)

- [ ] **Creatify**: Sign up for paid API plan, get `API_ID`/`API_KEY`
- [ ] **fal.ai**: Create account, generate `FAL_KEY`, top up credits if needed
- [ ] Set both on Vercel + Render
- [ ] Test one real generation end-to-end (grid, fade-in, or AI UGC)

## 5. Convex → Production Deployment

- [ ] Run `npx convex deploy` to promote dev → production
- [ ] Update `CONVEX_DEPLOYMENT_NAME` / endpoint on both Vercel + Render
- [ ] Re-set support-chat AI keys via `npx convex env set` on production
- [ ] Verify database connection (users table should be empty)

## 6. Email Domain Setup

- [ ] Move email from `ehleedev@gmail.com` to `noreply@yourdomain.com` (or similar)
- [ ] Create SPF/DKIM/DMARC records for Brevo
- [ ] Update `EMAIL_FROM` / `EMAIL_FROM_NAME` on Vercel + Render
- [ ] Test password reset email delivery

## 7. Analytics (Optional: can ship without)

- [ ] Wire TikTok Analytics API (if supporting TikTok)
- [ ] Wire YouTube Analytics API (if supporting YouTube)
- [ ] Replace `seededMetrics()` mock with real per-platform fetchers

## 8. Final Testing

- [ ] **Smoke test**: Sign up → connect account → schedule post → verify Render worker publishes
- [ ] **OAuth flow**: All enabled platforms (Twitter, LinkedIn, Mastodon, Bluesky, Google)
- [ ] **Billing**: Create account → upgrade plan → webhook sync → invoice generation
- [ ] **Content Studio**: Generate one grid video, one fade-in, optionally one AI UGC (if providers set up)
- [ ] **Email**: Trigger password reset, verify delivery to personal email
- [ ] **Edge case**: Reconnect an account, refresh token rotation, publish failure

## 9. Security Pre-Flight

- [ ] Confirm `PT_SECRET` is a strong 64-hex value (`openssl rand -hex 32`)
- [ ] Confirm `CRON_SECRET` is a strong 64-hex value
- [ ] Verify R2 token is scoped to `post-train-media` bucket only (no account-wide perms)
- [ ] Confirm no API keys are in git history (check with `git log` / `git grep`)
- [ ] Set up log retention/monitoring (optional: Vercel logs, Render logs)

## 10. Go Live

- [ ] Announce production launch URL
- [ ] Monitor for errors (Vercel dashboard, Render logs, Convex logs)
- [ ] Keep Render pinger (cron-job.org) active
- [ ] Monitor Stripe webhook deliveries for anomalies
- [ ] Keep Brevo sending email

---

## Post-Launch Backlog (not blocking)

- [ ] Video transcoding (ffmpeg on Render when platform rejects format)
- [ ] Webhook retry scanning (retries built in `convex/webhooks.ts`, not yet auto-triggered)
- [ ] Purchasable credit add-ons for Content Studio (UI + billing wired, just needs pricing)
- [ ] Additional OAuth platforms (YouTube, TikTok, Instagram, Facebook, Threads, Pinterest)
- [ ] Real webhook endpoint at Stripe Dashboard (currently sandbox)
