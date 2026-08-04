# Post Train — Active Backlog

Last reviewed: **2026-08-01**

Post Train is deployed at [posttrain.app](https://posttrain.app), but it is not yet in a full public launch. See [PRODUCTION.md](./PRODUCTION.md) for the release gates; this file is the product and platform backlog after those gates are understood.

## Highest priority: complete remaining social-account auth

The production domain removes the main callback-URL blocker. Build the remaining account connections now, then complete each provider's credentials and review process as it becomes available.

| Platform | Current state | Next auth work |
| --- | --- | --- |
| Facebook | Not connected | Build Page OAuth and page selection |
| Instagram | Not connected | Build Business/Creator OAuth after the Meta app is in place |
| Threads | Not connected | Add Meta-backed OAuth after Facebook/Instagram foundation |
| Pinterest | Awaiting credentials/approval | Add Pins API OAuth once approved |
| TikTok | Sandbox connection exists | Configure production credentials, callback, and review submission |

Already implemented: Twitter/X, LinkedIn, Mastodon, Bluesky, Google/YouTube, and TikTok sandbox draft-to-inbox. Twitter/X still needs production API credits to publish.

### Shared implementation work

- [ ] Establish the standard OAuth connection contract for new platforms: start route, callback route, encrypted credential storage, account discovery, reconnect, disconnect, and clear error states
- [ ] Use `https://posttrain.app` as the production callback origin in every provider console and production environment variable
- [ ] Add integration coverage for OAuth callback failures, expired tokens, reconnects, and multiple accounts from one authorization

### TikTok production submission

The custom domain is now available, so this is no longer blocked on domain acquisition.

- [ ] Update TikTok redirect URI and public-policy links to `posttrain.app`
- [ ] Update production `TIKTOK_CLIENT_ID` and `TIKTOK_CLIENT_SECRET` in Vercel and Render
- [ ] Record the required demo video (OAuth → compose → draft-to-inbox publish; under 50 MB)
- [ ] Submit the Login Kit and Content Posting API review
- [ ] Track approval and production verification results here

### Meta platforms: Facebook, Instagram, and Threads

- [ ] Create/restore the Meta Developer account and app
- [ ] Implement Facebook Page OAuth, page selection, encrypted token storage, reconnect, and disconnect first
- [ ] Implement Facebook Page publishing after the connection flow is stable
- [ ] Add the required Page permissions and complete Meta review
- [ ] Reuse the Meta app for Instagram Business/Creator OAuth and publishing
- [ ] Add Threads OAuth and publishing from the same Meta app where supported

### Pinterest

- [ ] Obtain/confirm Pinterest trial approval and app secret
- [ ] Add production credentials to Vercel and Render
- [ ] Implement and test Pins API v5 OAuth and publishing

## Next: controlled-production validation

- [ ] Run the full production smoke test in `PRODUCTION.md`
- [ ] Confirm production OAuth callbacks for every enabled platform use `posttrain.app`
- [ ] Validate the Render worker on a real scheduled post, including retry/failure behavior
- [ ] Exercise the workspace storage flow at/near the limit: meter, cleanup-on, cleanup-off, protected media, and Library deletion
- [ ] Test a real Content Studio render through Library → Create Post → publish
- [ ] Confirm all deployed pages work on desktop and mobile before opening access broadly

## Launch configuration and provider readiness

### Twitter/X

- [ ] Buy API credits if X publishing is included in launch messaging
- [ ] Test text, image, and video publishing with production credits

### Content Studio providers

- [ ] Add paid Creatify credentials if stock UGC output will ship
- [ ] Add funded fal.ai credentials if AI UGC output will ship
- [ ] Verify provider failures are understandable and do not leave orphaned R2 media

## Product backlog

### Dashboard and workflow

- [ ] Add a true Home/Overview dashboard: upcoming posts, quick actions, recent activity, and account health
- [ ] Add an Activity/Inbox surface for publish failures, reconnect prompts, and important automation events
- [ ] Decide whether Batch Scheduler belongs inside Content Studio as a mode rather than a separate area
- [ ] Continue visual differentiation on the remaining marketing and public pages

### Media and storage

- [ ] Add an explicit storage-management view with sortable large files and per-file byte counts
- [ ] Add a scheduled orphan scan/report for R2 objects that have no media record
- [ ] Add a clear retention policy and user-facing notice before automatic deletion becomes broadly relied upon
- [ ] Consider paid storage add-ons separately from plan upgrades once usage data exists
- [ ] Add an audit trail for automatic cleanup and permanent Library deletion

### Publishing and reliability

- [ ] Add video transcoding/normalization for platform-specific codec or format failures
- [ ] Trigger webhook retry scanning automatically; retry logic exists but is not yet scheduled
- [ ] Improve publish failure diagnostics by provider and make retry/reconnect next steps obvious
- [ ] Add production health checks and alerts for the worker, R2 upload failures, and Stripe webhooks

### Analytics

- [ ] Replace seeded metrics with real per-platform fetchers
- [ ] TikTok metrics: OAuth scope plus video metrics endpoint
- [ ] YouTube Analytics API integration
- [ ] Instagram Graph API insights after Meta approval

### Explore / trend library

- [ ] Keep Explore hidden until it uses licensed or official trend data
- [ ] Do not rehost third-party creator media in R2 without explicit rights
- [ ] Evaluate safe sources: YouTube `mostPopular`, approved Pinterest trend data, approved Meta search, and manual curation
- [ ] Decide whether Explore returns as a paid feature, an internal curation tool, or a free lead-generation surface

## Explicitly deferred

### TikTok direct-to-profile publishing

Draft-to-inbox is the supported path today. Direct profile posting is a later upgrade.

- [ ] Add TikTok `video.publish` approval and scope
- [ ] Build the pre-post consent screen: privacy, duet/stitch/comment controls, and creator identity
- [ ] Wire the existing direct-publish implementation into the publish flow
- [ ] Complete TikTok's direct-post audit before enabling the composer control

## Technical debt and quality

- [ ] Add integration tests for OAuth callbacks, publish retries, Stripe webhooks, and storage cleanup
- [ ] Add end-to-end tests for Create Post video destination selection, aspect-ratio crop, and replacement flow
- [ ] Establish database/R2 migration and rollback playbooks
- [ ] Keep dependency and Convex AI guidance current as part of routine maintenance
