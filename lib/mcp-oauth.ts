// OAuth 2.1 authorization server for the MCP endpoint, per the MCP
// authorization spec: RFC 9728 protected-resource metadata, RFC 8414 AS
// metadata, RFC 7591 dynamic client registration, PKCE (S256 only), and
// RFC 8707 resource indicators with audience validation.
//
// Claude connects to `/api/mcp` as an OAuth client. It discovers this server
// from the 401 challenge, registers itself, sends the user here to approve,
// and exchanges the resulting code for tokens. We are both the resource server
// and the authorization server — the "user" being authorized is whoever is
// signed into Post Train in that browser.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sign } from "./auth";
import { convexMutation, convexQuery, now, uid } from "./db";
import { api } from "@/convex/_generated/api";

export const ACCESS_TOKEN_TTL_MS = 60 * 60_000; // 1h
const CODE_TTL_MS = 60_000; // 1 min — the spec's SHOULD is "short-lived"
const REFRESH_TTL_MS = 90 * 86400_000; // 90d

/** Read-only tools vs. anything that publishes or mutates. */
export const SCOPES = {
  read: "View your posts, connected accounts, media, and analytics.",
  publish: "Create, update, delete, and publish posts on your behalf.",
} as const;
export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Canonical resource identifier this server issues tokens for (RFC 8707). */
export const mcpResourceUri = (origin: string) => `${origin}/api/mcp`;

export const issuerUrl = (origin: string) => origin;

export function parseScope(raw: string | null | undefined): Scope[] {
  const requested = (raw ?? "").split(/\s+/).filter(Boolean);
  // Unknown scopes are dropped rather than rejected, so a client asking for a
  // scope we retired still gets a usable token for the ones we kept.
  const granted = ALL_SCOPES.filter((s) => requested.includes(s));
  return granted.length ? granted : ["read"];
}

/**
 * Access tokens are stateless: an HMAC over the claims, verified without a
 * database round trip so MCP tool calls stay cheap. Refresh tokens are opaque
 * and stored, which is what makes revocation possible.
 */
export type AccessClaims = {
  sub: string; // user id
  ws: string; // workspace id
  cid: string; // client id
  scope: string;
  aud: string; // resource indicator — validated on every request
  exp: number;
};

export function mintAccessToken(claims: Omit<AccessClaims, "exp">): { token: string; expiresIn: number } {
  const payload: AccessClaims = { ...claims, exp: Date.now() + ACCESS_TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `pt_mcp_${body}.${sign(body)}`, expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) };
}

export function verifyAccessToken(token: string, expectedAudience: string): AccessClaims | null {
  if (!token.startsWith("pt_mcp_")) return null;
  const [body, mac] = token.slice("pt_mcp_".length).split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  // Constant-time compare — a length mismatch alone would otherwise leak via timing.
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  let claims: AccessClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessClaims;
  } catch {
    return null;
  }
  if (Date.now() > claims.exp) return null;
  // Audience binding (RFC 8707 §2): a token minted for another resource must
  // not be accepted here, even though it carries our own valid signature.
  if (claims.aud !== expectedAudience) return null;
  return claims;
}

export const newOpaqueToken = () => randomBytes(32).toString("base64url");

/** PKCE S256 verification. `plain` is deliberately unsupported (OAuth 2.1 forbids it). */
export function verifyPkce(codeVerifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

export type OAuthClient = {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  redirect_uris: string[];
};

export const findClient = (clientId: string) =>
  convexQuery<OAuthClient | null>(api.oauth.getClientByClientId, { client_id: clientId });

/**
 * A redirect URI must match one the client registered, byte for byte. Prefix
 * or "startsWith" matching here is the classic open-redirect hole — an
 * attacker registers `https://evil.example` and rides a victim's code out.
 */
export const redirectUriRegistered = (client: OAuthClient, redirectUri: string) =>
  client.redirect_uris.includes(redirectUri);

export async function registerClient(opts: {
  clientName: string;
  redirectUris: string[];
  isPublic: boolean;
}): Promise<{ client: OAuthClient; clientSecret: string | null }> {
  const clientId = `ptc_${randomBytes(16).toString("hex")}`;
  const clientSecret = opts.isPublic ? null : `pts_${randomBytes(32).toString("hex")}`;
  await convexMutation(api.oauth.createClient, {
    id: uid(),
    client_id: clientId,
    client_secret_hash: clientSecret ? hashToken(clientSecret) : null,
    client_name: opts.clientName.slice(0, 120),
    redirect_uris: opts.redirectUris,
  });
  const client = await findClient(clientId);
  if (!client) throw new Error("Client registration failed.");
  return { client, clientSecret };
}

/** Confidential clients must present their secret; public clients rely on PKCE. */
export function clientSecretValid(client: OAuthClient, presented: string | null): boolean {
  if (!client.client_secret_hash) return true;
  if (!presented) return false;
  const a = Buffer.from(hashToken(presented));
  const b = Buffer.from(client.client_secret_hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueAuthorizationCode(opts: {
  clientId: string;
  userId: string;
  workspaceId: string;
  scope: Scope[];
  resource: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const code = newOpaqueToken();
  await convexMutation(api.oauth.createGrant, {
    id: uid(),
    kind: "code",
    token_hash: hashToken(code),
    client_id: opts.clientId,
    user_id: opts.userId,
    workspace_id: opts.workspaceId,
    scope: opts.scope.join(" "),
    resource: opts.resource,
    redirect_uri: opts.redirectUri,
    code_challenge: opts.codeChallenge,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return code;
}

export async function issueRefreshToken(opts: {
  clientId: string;
  userId: string;
  workspaceId: string;
  scope: string;
  resource: string;
}): Promise<string> {
  const token = newOpaqueToken();
  await convexMutation(api.oauth.createGrant, {
    id: uid(),
    kind: "refresh",
    token_hash: hashToken(token),
    client_id: opts.clientId,
    user_id: opts.userId,
    workspace_id: opts.workspaceId,
    scope: opts.scope,
    resource: opts.resource,
    redirect_uri: null,
    code_challenge: null,
    expires_at: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  });
  return token;
}

export type Grant = {
  id: string;
  kind: string;
  client_id: string;
  user_id: string;
  workspace_id: string;
  scope: string;
  resource: string;
  redirect_uri: string | null;
  code_challenge: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

/** Atomically redeems a code or refresh token; null if replayed or expired. */
export const consumeGrant = (token: string) =>
  convexMutation<Grant | null>(api.oauth.consumeGrant, { token_hash: hashToken(token) });

/** OAuth error responses are a defined JSON shape, not our usual error envelope. */
export function oauthError(error: string, description: string, status = 400): Response {
  return Response.json({ error, error_description: description }, { status });
}

/**
 * The 401 every unauthenticated MCP request gets. `resource_metadata` is how a
 * client discovers this authorization server at all (RFC 9728 §5.1).
 */
export function unauthorizedChallenge(origin: string, description = "Authorization required."): Response {
  return new Response(JSON.stringify({ error: "invalid_token", error_description: description }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="Post Train", resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${ALL_SCOPES.join(" ")}"`,
    },
  });
}

/** 403 for a valid token that lacks the scope this tool needs (RFC 6750 §3.1). */
export function insufficientScope(origin: string, needed: Scope): Response {
  return new Response(
    JSON.stringify({ error: "insufficient_scope", error_description: `This action requires the "${needed}" scope.` }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${needed}", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    }
  );
}

export const grantsForUser = (userId: string) =>
  convexQuery<Grant[]>(api.oauth.listGrantsForUser, { user_id: userId });

export const revokeClientForUser = (userId: string, clientId: string) =>
  convexMutation<number>(api.oauth.revokeGrantsForClient, { user_id: userId, client_id: clientId });

export { now };
