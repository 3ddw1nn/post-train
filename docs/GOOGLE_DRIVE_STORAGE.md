# 🗄️ Google Drive as an optional storage destination

**Status:** Planned, not started. This is a design doc, not a build in progress.

## Context

Today every media upload goes to Cloudflare R2 (or local disk in dev, when R2 env vars are unset — see `lib/r2.ts`). Storage is metered per workspace with a fixed 1 GB allowance (`WORKSPACE_STORAGE_BYTES` in `lib/media.ts`).

The idea: let a user connect their own Google Drive and choose, per upload, whether a file goes to Post Train's R2 storage or straight into their Drive. Files stored in Drive don't count against Post Train's storage limit — the user is spending their own Google storage instead. This is **not** a migration off R2; both remain first-class, permanent storage backends side by side.

Decided scope (confirmed 2026-08-01):
- **Per-upload toggle** — the destination is picked at upload time, not a single workspace-wide default.
- **New uploads + a "move to Drive" action** — existing R2 files can also be moved into Drive later via an explicit per-file action (not a bulk migration job).
- **Per-workspace connection** — one Google account is connected per workspace (matches how social publishing accounts are connected today), not per individual user.

## Why this is a good fit (from codebase research)

- `lib/media.ts` already branches every storage operation on `r2Enabled()` vs. a local-disk fallback — a third branch is additive, not a rewrite.
- The `media` table (`convex/schema.ts:97`) stores no storage-specific URL/key today — location is computed on demand from `workspace_id` + `id` + `kind` + extension (`mediaObjectKey`, `lib/r2.ts:55`). Adding one new field is enough to record where a given row actually lives.
- Nothing downstream needs a public URL. Every consumer — the player, the library, `lib/publish.ts`'s platform adapters — goes through the app's own `/api/media-file/[id]` route or `readMediaBytes()`, which fetch bytes **server-side** first (`lib/media.ts:259`). Google Drive's fiddly sharing/permissions model never has to be exposed to a third party.
- Google OAuth infrastructure already exists and can be extended rather than rebuilt: `lib/youtube.ts` does Google OAuth (same `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `oauth-state.ts` envelope, refresh-token flow) purely via `fetch` against Google's REST APIs — no SDK dependency needed. `lib/secretbox.ts` (AES-256-GCM) already encrypts platform credentials at rest, used today for `social_accounts.credentials`.

## Data model changes

**New table `storage_connections`** (`convex/schema.ts`), one row per workspace, same shape as `social_accounts`:

```ts
storage_connections: defineTable({
  workspace_id: v.string(),
  provider: v.string(), // "google_drive" (room for future providers, but only one for now)
  account_email: v.string(),
  folder_id: v.string(), // the "Post Train" folder created in the user's Drive on connect
  status: v.string(), // "active" | "reauth_required"
  connected_at: v.string(),
  credentials: v.string(), // encryptJson(...) — access/refresh token, same pattern as social_accounts
})
  .index("by_workspace", ["workspace_id"])
  .index("by_workspace_provider", ["workspace_id", "provider"]),
```

**`media` table** — add two optional fields:
- `storage_provider: v.optional(v.string())` — `"r2" | "gdrive"`, defaults to `"r2"` for all existing rows.
- `gdrive_file_id: v.optional(nullableString)` — the Drive file id, since Drive doesn't support the derivable-key convention R2 uses (`mediaObjectKey`); Drive assigns its own opaque id on upload.

## New module: `lib/gdrive.ts`

Mirrors `lib/youtube.ts` structure exactly — plain `fetch` against Drive API v3, no new npm dependency:

- `driveRedirectUri(origin)`, `authorizeUrl(origin, state)` — scope `https://www.googleapis.com/auth/drive.file` (only files the app creates/opens — never blanket Drive access).
- `exchangeCodeForToken(code, origin)`, `refreshAccessToken(refreshToken)` — identical shape to the YouTube versions.
- `ensurePostTrainFolder(accessToken)` — `files.create` with `mimeType: application/vnd.google-apps.folder`, called once on connect; the returned folder id is stored as `storage_connections.folder_id`.
- `uploadToDrive(accessToken, folderId, { name, mimeType, bytes })` — multipart upload (`POST /upload/drive/v3/files?uploadType=multipart`) for files under a size threshold; resumable upload session (same pattern YouTube already uses for its own resumable video uploads, per `docs/FINISHED.md`) for anything larger. Returns the Drive file id.
- `downloadFromDrive(accessToken, fileId)` — `GET /drive/v3/files/{id}?alt=media`, returns bytes.
- `deleteFromDrive(accessToken, fileId)` — `DELETE /drive/v3/files/{id}`.
- A `withValidAccessToken(connection)` helper that refreshes and re-encrypts credentials when the stored `access_token` is expired, same pattern as YouTube's publish-time refresh.

## OAuth routes

Follow the existing per-platform pair exactly:
- `app/api/connections/google-drive/start/route.ts` — sets the signed state cookie, redirects to `authorizeUrl(...)` (pattern: `app/api/connections/youtube/start/route.ts`).
- `app/api/oauth/google-drive/callback/route.ts` — exchanges the code, calls `ensurePostTrainFolder`, upserts the `storage_connections` row via a new `convex/storageConnections.ts` mutation (pattern: `app/api/oauth/youtube/callback/route.ts`).

Requires registering the new callback URL as an authorized redirect URI in the existing Google Cloud project (same project YouTube OAuth already uses) — no new client id/secret.

## Convex changes

- New `convex/storageConnections.ts`: `upsert`, `getForWorkspace` (never returns `credentials`, same convention as `convex/accounts.ts` for `social_accounts`), `remove` (disconnect).
- `convex/media.ts`: `createMedia` and `markUploaded` accept `storage_provider` (default `"r2"`); add a `setStorageProvider` mutation for the "move to Drive" action to flip `storage_provider` + set `gdrive_file_id` after a successful copy.

## `lib/media.ts` changes

The existing `r2Enabled() ? R2 : local-disk` branches become a 3-way switch keyed on `row.storage_provider`:
- `createUploadUrl(...)` gains an explicit `destination: "r2" | "gdrive"` param (instead of inferring storage from `r2Enabled()`), only accepting `"gdrive"` when the workspace has an active `storage_connections` row.
- `storeUpload`, `readMediaBytes`, `getMediaRedirectUrl`, `deleteMedia`, `deleteMediaIfUnreferenced` each add a `row.storage_provider === "gdrive"` branch calling the new `lib/gdrive.ts` functions, alongside the existing R2/local branches.
- New `moveMediaToDrive(workspaceId, mediaId)`: `readMediaBytes` (existing R2 file) → `uploadToDrive` → `setStorageProvider` mutation → `deleteR2Object` (delete-after-confirmed-upload, so a failed Drive upload never loses the original).

## UI changes

- **Settings → Storage section** (`app/dashboard/settings/page.tsx:155`, existing `id="storage"` section): add a "Connect Google Drive" card showing connected account email + a Disconnect button, following the same card pattern used for social account connections.
- **Upload flow** (`components/media.tsx:85`, `uploadOneFile`): the single choke point every uploader already calls through (composer, library, grid-studio, etc.). Add a `destination` param threaded from a small toggle shown in the upload UI, but only when `storage_connections` has an active row for the workspace — otherwise no new UI appears at all for workspaces that haven't connected Drive.
- **Library view** (`components/library-view.tsx`): add a "Move to Google Drive" item to each file's action menu, visible only when Drive is connected and the file is currently on `"r2"`.

## Verification plan

1. Connect flow: from Settings, connect a real Google account, confirm a "Post Train" folder appears in that account's Drive and `storage_connections` has one row.
2. Upload-to-Drive: upload a small image and a >5MB video with the Drive destination selected; confirm both appear in the Drive folder and play back correctly through `/api/media-file/[id]` in the app (proves the server-side byte-fetch path works, not just the upload).
3. Publish-through: create a post using a Drive-backed media item and publish to a connected test platform (e.g. Bluesky) — confirms `readMediaBytes` correctly downloads from Drive for the publish adapters.
4. Move-to-Drive: pick an existing R2 file, run "Move to Google Drive," confirm it plays back afterward and is gone from the R2 bucket (staff storage browser) but present in Drive.
5. Token refresh: manually expire/revoke the stored access token (or wait out its TTL) and confirm a subsequent read triggers `refreshAccessToken` transparently.
6. Disconnect: disconnect Drive from Settings, confirm the per-upload toggle disappears and previously Drive-stored files still play back read-only failure is handled gracefully (expected: reads fail cleanly with a clear error, since the app no longer has a valid token) — decide before building whether disconnect should be blocked while Drive-backed files still exist, or just warn.
