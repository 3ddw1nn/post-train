# Production Readiness

Last reviewed: **2026-08-01**

## Current status

Post Train is deployed on its production domain, [posttrain.app](https://posttrain.app). This is a **production deployment**, not a public launch: the app is live for controlled use and testing, but launch communications and several third-party production checks are intentionally still outstanding.

Use this document for launch readiness. `TODO.md` holds product and platform work that can continue independently of launch.

## Confirmed in place

- [x] Production domain acquired and connected: `posttrain.app`
- [x] App deployed on Vercel
- [x] Render worker deployed and kept awake by an external pinger
- [x] Cloudflare R2 media storage configured
- [x] Convex-backed app database connected
- [x] Workspace storage controls implemented in the product
  - Free workspaces receive 1 GB
  - Creator, Growth, and Pro workspaces receive 5 GB, 25 GB, and 100 GB
  - Usage is measured per workspace, not per user
  - Automatic cleanup is on by default and only removes media not used by a post, active draft, source, or thumbnail
- [x] Existing domain references in the app and API use `https://posttrain.app`

## Launch blockers

### 1. Verify the production environment end to end

- [ ] Confirm `NEXT_PUBLIC_APP_URL=https://posttrain.app` in Vercel production
- [ ] Confirm Vercel and Render both point at the intended **Convex production** deployment, not a development deployment
- [ ] Confirm production Convex environment variables, especially support-chat and signing keys
- [ ] Confirm production R2 credentials are scoped to the Post Train bucket only
- [ ] Confirm the deployed commit is the intended release candidate
- [ ] Run the smoke-test checklist below against `posttrain.app`

### 2. Update third-party OAuth and webhook configuration

- [ ] Google OAuth callback: `https://posttrain.app/api/auth/google/callback`
- [ ] LinkedIn callback: `https://posttrain.app/api/oauth/linkedin/callback`
- [ ] Twitter/X callback: `https://posttrain.app/api/oauth/twitter/callback`
- [ ] TikTok callback and review URLs: `https://posttrain.app/tos` and `https://posttrain.app/privacy-policy`
- [ ] Update any remaining provider callback/allow-list entries that still use a Vercel preview URL
- [ ] Confirm every enabled platform can connect, reconnect, and disconnect on the production domain

### 3. Move billing from sandbox to live mode

- [ ] Create or activate the live Stripe account
- [ ] Recreate Creator, Growth, and Pro products/prices in live mode
- [ ] Do NOT recreate the API add-on prices — API + MCP access now ships with every
      paid plan (`lib/entitlements.ts` → `apiAccess`), so the add-on would grant nothing.
      Remove `STRIPE_PRICE_ADDON_*` from the live env once no subscriber holds it.
- [ ] Set live Stripe keys in Vercel production
- [ ] Register `https://posttrain.app/api/webhooks/stripe` as the live Stripe webhook
- [ ] Send a real-card checkout through each critical path: start trial, change plan, cancel, resume, and webhook sync
- [ ] Verify a plan change updates the workspace storage allowance correctly

### 4. Production email identity

- [ ] Move the sender from the personal Gmail address to a domain sender such as `noreply@posttrain.app`
- [ ] Add and verify SPF, DKIM, and DMARC records with Brevo
- [ ] Set `EMAIL_FROM` and `EMAIL_FROM_NAME` in production
- [ ] Verify password reset and publish/failure email delivery from production

### 5. Publishing-provider readiness

- [ ] Buy Twitter/X API credits if X publishing is part of launch
- [ ] Test LinkedIn, Mastodon, Bluesky, YouTube, and TikTok draft publishing with real production accounts
- [ ] Set paid Creatify/fal.ai credentials if AI UGC generation will be advertised at launch
- [ ] Generate one real Studio render and verify its R2 object, Library card, Create Post handoff, and publish flow

## Production smoke test

- [ ] Create a new account or use a clean controlled account
- [ ] Complete onboarding and connect at least one supported account
- [ ] Upload image and video media; verify it appears in the correct workspace Library
- [ ] Toggle workspace automatic storage cleanup in Settings
- [ ] Create a draft, schedule it, and verify the Render worker publishes it
- [ ] Confirm success/failure status and notification behavior
- [ ] Run a paid checkout and verify the Stripe webhook updates entitlements
- [ ] Create a Content Studio video, finish it, and create a post from it
- [ ] Delete a safe Library file and confirm both its metadata and R2 object are removed
- [ ] Confirm a media file attached to a post or active draft cannot be deleted by cleanup
- [ ] Verify sign out, password reset, and sign-in flows

## Security and operations

- [ ] Confirm `PT_SECRET` and `CRON_SECRET` are unique, production-only 64-hex secrets
- [ ] Confirm no production secrets appear in git history, build output, or client-side environment variables
- [ ] Restrict R2 credentials to the required bucket and operations
- [ ] Configure error/log retention for Vercel, Render, Convex, and Stripe
- [ ] Establish a simple incident contact/runbook for failed publishes and billing-webhook failures
- [ ] Back up or document a recovery path for production Convex data before a public launch

## Public-launch switch

Do these only after all blocking checks above are complete.

- [ ] Remove any controlled-access or waitlist restrictions intended only for pre-launch
- [ ] Announce `https://posttrain.app`
- [ ] Watch Vercel, Render, Convex, R2, and Stripe logs closely for the first 48 hours
- [ ] Review publish failures daily and keep the Render pinger active

## Not launch blockers

- Full TikTok direct-to-profile publishing; draft-to-inbox is the current supported path
- Real analytics for every platform
- Explore/trend-library relaunch with licensed data
- Additional OAuth platforms and Meta platform review
- Purchasable Studio credit packs beyond the existing plan limits
