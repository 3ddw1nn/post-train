// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

// Secrets are write-only from the app's perspective, same rule as api_keys:
// nothing that reaches a client response may carry the hash.
const stripSecret = ({ client_secret_hash: _s, ...rest }) => rest;

export const getClientByClientId = query({
  args: { client_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oauth_clients")
      .withIndex("by_client_id", (q) => q.eq("client_id", args.client_id))
      .unique();
  },
});

export const createClient = mutation({
  args: {
    id: v.string(),
    client_id: v.string(),
    client_secret_hash: v.union(v.string(), v.null()),
    client_name: v.string(),
    redirect_uris: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauth_clients", { ...args, created_at: now() });
    return stripSecret(await byLegacyId(ctx, "oauth_clients", args.id));
  },
});

export const createGrant = mutation({
  args: {
    id: v.string(),
    kind: v.string(),
    token_hash: v.string(),
    client_id: v.string(),
    user_id: v.string(),
    workspace_id: v.string(),
    scope: v.string(),
    resource: v.string(),
    redirect_uri: v.union(v.string(), v.null()),
    code_challenge: v.union(v.string(), v.null()),
    expires_at: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauth_grants", { ...args, consumed_at: null, created_at: now() });
    return await byLegacyId(ctx, "oauth_grants", args.id);
  },
});

export const getGrantByHash = query({
  args: { token_hash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oauth_grants")
      .withIndex("by_hash", (q) => q.eq("token_hash", args.token_hash))
      .unique();
  },
});

/**
 * Single-use redemption for authorization codes. The read and the write happen
 * in one transaction so two parallel token requests carrying the same code
 * cannot both succeed — a replayed code returns null rather than a second token.
 */
export const consumeGrant = mutation({
  args: { token_hash: v.string() },
  handler: async (ctx, args) => {
    const grant = await ctx.db
      .query("oauth_grants")
      .withIndex("by_hash", (q) => q.eq("token_hash", args.token_hash))
      .unique();
    if (!grant || grant.consumed_at) return null;
    if (Date.parse(grant.expires_at) < Date.now()) return null;
    await ctx.db.patch(grant._id, { consumed_at: now() });
    return grant;
  },
});

/** Grants the signed-in user can see and revoke on the Connected Apps panel. */
export const listGrantsForUser = query({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    const grants = await ctx.db
      .query("oauth_grants")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .collect();
    return grants.filter((g) => g.kind === "refresh" && !g.consumed_at);
  },
});

/** Revokes every refresh token this user holds for one client ("Disconnect"). */
export const revokeGrantsForClient = mutation({
  args: { user_id: v.string(), client_id: v.string() },
  handler: async (ctx, args) => {
    const grants = await ctx.db
      .query("oauth_grants")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .collect();
    const live = grants.filter((g) => g.client_id === args.client_id && !g.consumed_at);
    for (const grant of live) await ctx.db.patch(grant._id, { consumed_at: now() });
    return live.length;
  },
});

/**
 * Fixed-window rate limit. Returns the request's position in the current
 * window; the caller rejects once it exceeds the limit. Windows are keyed by
 * epoch minute, so a stale row is simply never read again — `expires_at` exists
 * for the sweep below rather than for correctness.
 */
export const bumpRateWindow = mutation({
  args: { bucket_key: v.string(), expires_at: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("api_rate_windows")
      .withIndex("by_bucket_key", (q) => q.eq("bucket_key", args.bucket_key))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { count: row.count + 1 });
      return row.count + 1;
    }
    await ctx.db.insert("api_rate_windows", { ...args, count: 1 });
    return 1;
  },
});

/** Batch-deletes expired rate windows and grants. Called by the worker tick. */
export const sweepExpired = mutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const windows = await ctx.db.query("api_rate_windows").take(limit);
    let deleted = 0;
    for (const row of windows) {
      if (row.expires_at < Date.now()) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    const grants = await ctx.db.query("oauth_grants").take(limit);
    for (const grant of grants) {
      // Consumed codes are kept briefly so a replay is detectable rather than
      // looking like an unknown code; expiry is what finally clears them.
      if (Date.parse(grant.expires_at) < Date.now()) {
        await ctx.db.delete(grant._id);
        deleted++;
      }
    }
    return deleted;
  },
});
