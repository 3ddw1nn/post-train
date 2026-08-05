// Auth for the public API v1 and the MCP server. Two credential types reach
// here and resolve to the same ApiContext:
//
//   pt_live_…  workspace API keys, created in the dashboard (API v1 + MCP)
//   pt_mcp_…   OAuth access tokens, issued to an MCP client the user approved
//
// API keys carry every scope; OAuth tokens carry only what the user consented
// to, which is why `scopes` is on the context and tool handlers check it.
import { createHash } from "node:crypto";
import { convexMutation, convexQuery, now } from "./db";
import type { User } from "./auth";
import { getSubscription } from "./billing";
import { apiAccess, apiRateLimit } from "./entitlements";
import type { Workspace } from "./workspaces";
import { DomainError } from "./posts";
import { ALL_SCOPES, verifyAccessToken, type Scope } from "./mcp-oauth";
import { api } from "@/convex/_generated/api";

export const API_KEY_PREFIX = "pt_live_";
export const OAUTH_TOKEN_PREFIX = "pt_mcp_";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export type ApiContext = {
  user: User;
  workspace: Workspace;
  keyId: string;
  scopes: Scope[];
  /** "api_key" holders are the workspace owner; "oauth" is a delegated client. */
  via: "api_key" | "oauth";
};

/**
 * Durable fixed-window limit, tiered by plan (lib/entitlements.ts). This used
 * to be an in-process Map, which meant every serverless instance kept its own
 * counter and the documented limit was never actually enforced — fine when API
 * access was a paid add-on, not fine now that it ships with every plan.
 *
 * The bucket key is the credential, not the workspace: one noisy integration
 * can't starve the customer's other keys.
 *
 * ponytail: one Convex write per request, and a burst can still straddle a
 * window boundary (up to 2× the limit across two adjacent minutes). Upgrade
 * path if that matters: sliding window, or a token bucket keyed the same way.
 */
async function enforceRateLimit(bucketId: string, limit: number): Promise<void> {
  const windowStart = Math.floor(Date.now() / 60_000);
  const count = await convexMutation<number>(api.oauth.bumpRateWindow, {
    bucket_key: `${bucketId}:${windowStart}`,
    expires_at: (windowStart + 2) * 60_000,
  });
  if (count > limit) {
    throw new DomainError(429, `Rate limit exceeded (${limit}/min on this plan). Retry in a minute.`);
  }
}

/**
 * Shared tail: both credential types must resolve to a real, entitled
 * workspace. The subscription is resolved before the rate limit because the
 * limit depends on the plan — the two lookups are cached queries, and the
 * limiter's job is protecting the work downstream of here, not this lookup.
 */
async function contextFor(
  workspaceId: string,
  keyId: string,
  scopes: Scope[],
  via: ApiContext["via"],
  bucketId: string
): Promise<ApiContext> {
  const workspace = await convexQuery<Workspace | null>(api.records.getByLegacyId, {
    table: "workspaces",
    id: workspaceId,
  });
  if (!workspace) throw new DomainError(401, "Missing or invalid credentials.");
  const user = await convexQuery<User | null>(api.auth.getUserById, { id: workspace.owner_id });
  if (!user) throw new DomainError(401, "Missing or invalid credentials.");
  const sub = await getSubscription(user.id);
  if (!apiAccess(sub)) {
    throw new DomainError(403, "API access requires an active Post Train plan.");
  }
  await enforceRateLimit(bucketId, apiRateLimit(sub));
  return { user, workspace, keyId, scopes, via };
}

function bearer(req: Request): string | null {
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** API v1 — accepts workspace API keys only. */
export async function authenticateApiKey(req: Request): Promise<ApiContext> {
  const token = bearer(req);
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    throw new DomainError(401, "Missing or invalid API key.");
  }
  const key = await convexQuery<{ id: string; workspace_id: string } | null>(api.apiKeys.getByHash, {
    key_hash: hashKey(token),
  });
  if (!key) throw new DomainError(401, "Missing or invalid API key.");

  const ctx = await contextFor(key.workspace_id, key.id, [...ALL_SCOPES], "api_key", key.id);
  await convexMutation(api.apiKeys.patchApiKey, { id: key.id, patch: { last_used_at: now() } });
  return ctx;
}

/**
 * MCP — accepts either credential. `expectedAudience` is the canonical resource
 * URI of this MCP endpoint; an OAuth token minted for any other resource is
 * rejected even though it carries our own valid signature (RFC 8707 §2).
 */
export async function authenticateMcp(req: Request, expectedAudience: string): Promise<ApiContext> {
  const token = bearer(req);
  if (!token) throw new DomainError(401, "Missing credentials.");

  if (token.startsWith(OAUTH_TOKEN_PREFIX)) {
    const claims = verifyAccessToken(token, expectedAudience);
    if (!claims) throw new DomainError(401, "The access token is invalid, expired, or issued for another resource.");
    const scopes = claims.scope.split(/\s+/).filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s));
    // Bucket per (client, user) so one user's connector can't exhaust another's.
    return await contextFor(claims.ws, claims.cid, scopes, "oauth", `${claims.cid}:${claims.sub}`);
  }

  if (token.startsWith(API_KEY_PREFIX)) return await authenticateApiKey(req);
  throw new DomainError(401, "Unrecognized credential format.");
}

export function jsonError(e: unknown): Response {
  if (e instanceof DomainError) {
    return Response.json(
      { error: { message: e.message, ...(e.code ? { code: e.code } : {}) } },
      { status: e.status }
    );
  }
  console.error("[api] unexpected error", e);
  return Response.json({ error: { message: "Internal error." } }, { status: 500 });
}
