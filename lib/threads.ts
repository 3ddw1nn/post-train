import { randomBytes } from "node:crypto";
import { packOAuthState as packState, requireEnv, unpackOAuthState as unpackState } from "./oauth-state";

// Threads API — its own Meta app product, own credentials, own Graph host.
// No Facebook Page involved (closer to lib/instagram-direct.ts than lib/facebook.ts).
const GRAPH_VERSION = "v1.0";
const AUTHORIZE_URL = "https://threads.net/oauth/authorize";
const TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const LONG_LIVED_URL = "https://graph.threads.net/access_token";
const GRAPH_URL = `https://graph.threads.net/${GRAPH_VERSION}`;
const SCOPES = "threads_basic,threads_content_publish";

export type ThreadsCredentials = { access_token: string; user_id: string; expires_at: number };
export type OAuthFlowState = { state: string; returnTo: string; reconnect?: number; exp: number };
export class ThreadsError extends Error { constructor(message: string, public code: "auth_expired" | "platform_error") { super(message); } }
export const isThreadsError = (error: unknown): error is ThreadsError => error instanceof ThreadsError;
export const threadsRedirectUri = (origin: string) => `${origin}/api/oauth/threads/callback`;
export const newCsrfState = () => randomBytes(16).toString("hex");
export const packOAuthState = (data: Omit<OAuthFlowState, "exp">) => packState<OAuthFlowState>(data);
export const unpackOAuthState = (token: string | undefined) => unpackState<OAuthFlowState>(token);

export function authorizeUrl(origin: string, state: string) {
  return `${AUTHORIZE_URL}?${new URLSearchParams({ response_type: "code", client_id: requireEnv("THREADS_CLIENT_ID"), redirect_uri: threadsRedirectUri(origin), scope: SCOPES, state })}`;
}

export async function exchangeCodeForToken(code: string, origin: string): Promise<ThreadsCredentials> {
  const shortLived = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: requireEnv("THREADS_CLIENT_ID"), client_secret: requireEnv("THREADS_CLIENT_SECRET"), grant_type: "authorization_code", redirect_uri: threadsRedirectUri(origin), code }),
  });
  if (!shortLived.ok) throw new ThreadsError(`Threads token exchange failed: ${await shortLived.text()}`, "platform_error");
  const shortJson = await shortLived.json() as { access_token?: string; user_id?: string };
  if (!shortJson.access_token || !shortJson.user_id) throw new ThreadsError("Threads did not return an access token.", "platform_error");

  // Short-lived tokens expire in ~1h; exchange for a ~60-day one before it's used for anything.
  const longLived = await fetch(`${LONG_LIVED_URL}?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: requireEnv("THREADS_CLIENT_SECRET"), access_token: shortJson.access_token })}`);
  if (!longLived.ok) throw new ThreadsError(`Threads long-lived token exchange failed: ${await longLived.text()}`, "platform_error");
  const longJson = await longLived.json() as { access_token?: string; expires_in?: number };
  if (!longJson.access_token) throw new ThreadsError("Threads did not return a long-lived access token.", "platform_error");

  return { access_token: longJson.access_token, user_id: shortJson.user_id, expires_at: Date.now() + (longJson.expires_in ?? 60 * 24 * 60 * 60) * 1000 };
}

export async function fetchThreadsProfile(creds: ThreadsCredentials): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null }> {
  const res = await fetch(`${GRAPH_URL}/me?${new URLSearchParams({ fields: "id,username,name,threads_profile_picture_url", access_token: creds.access_token })}`);
  if (!res.ok) throw new ThreadsError(`Could not fetch Threads profile: ${await res.text()}`, "platform_error");
  const json = await res.json() as { id?: string; username?: string; name?: string; threads_profile_picture_url?: string };
  if (!json.id || !json.username) throw new ThreadsError("Threads did not return account details.", "platform_error");
  return { id: json.id, username: json.username, displayName: json.name || json.username, avatarUrl: json.threads_profile_picture_url ?? null };
}
