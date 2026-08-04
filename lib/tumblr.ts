import { randomBytes } from "node:crypto";
import { packOAuthState as packState, requireEnv, unpackOAuthState as unpackState } from "./oauth-state";

const AUTHORIZE_URL = "https://www.tumblr.com/oauth2/authorize";
const TOKEN_URL = "https://api.tumblr.com/v2/oauth2/token";
const API_URL = "https://api.tumblr.com/v2";
const SCOPES = "basic write offline_access";
const USER_AGENT = "Post Train/1.0 (+https://posttrain.app)";

export type TumblrCredentials = { access_token: string; refresh_token: string; expires_at: number };
export type OAuthFlowState = { state: string; returnTo: string; reconnect?: number; exp: number };
export class TumblrError extends Error { constructor(message: string, public code: "auth_expired" | "platform_error") { super(message); } }
export const isTumblrError = (error: unknown): error is TumblrError => error instanceof TumblrError;
export const tumblrRedirectUri = (origin: string) => `${origin}/api/oauth/tumblr/callback`;
export const newCsrfState = () => randomBytes(16).toString("hex");
export const packOAuthState = (data: Omit<OAuthFlowState, "exp">) => packState<OAuthFlowState>(data);
export const unpackOAuthState = (token: string | undefined) => unpackState<OAuthFlowState>(token);

export function authorizeUrl(origin: string, state: string) {
  return `${AUTHORIZE_URL}?${new URLSearchParams({ response_type: "code", client_id: requireEnv("TUMBLR_CLIENT_ID"), redirect_uri: tumblrRedirectUri(origin), scope: SCOPES, state })}`;
}
export async function exchangeCodeForToken(code: string, origin: string): Promise<TumblrCredentials> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: requireEnv("TUMBLR_CLIENT_ID"), client_secret: requireEnv("TUMBLR_CLIENT_SECRET"), redirect_uri: tumblrRedirectUri(origin) }) });
  if (!res.ok) throw new TumblrError(`Tumblr token exchange failed: ${await res.text()}`, "platform_error");
  const json = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token || !json.refresh_token || !json.expires_in) throw new TumblrError("Tumblr did not return reusable credentials.", "platform_error");
  return { access_token: json.access_token, refresh_token: json.refresh_token, expires_at: Date.now() + json.expires_in * 1000 };
}
export async function refreshTumblrToken(creds: TumblrCredentials): Promise<TumblrCredentials> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refresh_token, client_id: requireEnv("TUMBLR_CLIENT_ID"), client_secret: requireEnv("TUMBLR_CLIENT_SECRET") }) });
  if (!res.ok) throw new TumblrError("Tumblr access expired — reconnect this account.", "auth_expired");
  const json = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token || !json.expires_in) throw new TumblrError("Tumblr returned an invalid refresh response.", "auth_expired");
  return { access_token: json.access_token, refresh_token: json.refresh_token ?? creds.refresh_token, expires_at: Date.now() + json.expires_in * 1000 };
}
export async function fetchTumblrProfile(accessToken: string): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null }> {
  const res = await fetch(`${API_URL}/user/info`, { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": USER_AGENT } });
  if (!res.ok) throw new TumblrError(`Could not fetch Tumblr profile: ${await res.text()}`, "platform_error");
  const json = await res.json() as { response?: { user?: { name?: string; blogs?: { name?: string; uuid?: string; title?: string; primary?: boolean }[] } } };
  const user = json.response?.user;
  const blog = user?.blogs?.find((item) => item.primary) ?? user?.blogs?.[0];
  if (!user?.name || !blog?.name || !blog.uuid) throw new TumblrError("No Tumblr primary blog was returned.", "platform_error");
  return { id: blog.uuid, username: blog.name, displayName: blog.title || blog.name, avatarUrl: `https://api.tumblr.com/v2/blog/${encodeURIComponent(blog.name)}.tumblr.com/avatar/128` };
}
