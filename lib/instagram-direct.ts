import { randomBytes } from "node:crypto";
import { packOAuthState as packState, requireEnv, unpackOAuthState as unpackState } from "./oauth-state";
import { InstagramError, type InstagramCredentials, type OAuthFlowState } from "./instagram";

// Direct Instagram Login — no Facebook Page required, but a separate Meta
// app/credentials (INSTAGRAM_CLIENT_ID/SECRET) and a separate Graph host
// (graph.instagram.com) from the Facebook-Login path in lib/instagram.ts.
// Both write the same InstagramCredentials union so lib/instagram-publish.ts
// can publish through either.
const GRAPH_VERSION = "v21.0";
const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_LIVED_URL = "https://graph.instagram.com/access_token";
const GRAPH_URL = `https://graph.instagram.com/${GRAPH_VERSION}`;
const SCOPES = "instagram_business_basic,instagram_business_content_publish";

export { isInstagramError } from "./instagram";
export const instagramDirectRedirectUri = (origin: string) => `${origin}/api/oauth/instagram-direct/callback`;
export const newCsrfState = () => randomBytes(16).toString("hex");
export const packOAuthState = (data: Omit<OAuthFlowState, "exp">) => packState<OAuthFlowState>(data);
export const unpackOAuthState = (token: string | undefined) => unpackState<OAuthFlowState>(token);

export function authorizeUrl(origin: string, state: string) {
  return `${AUTHORIZE_URL}?${new URLSearchParams({ force_reauth: "true", response_type: "code", client_id: requireEnv("INSTAGRAM_CLIENT_ID"), redirect_uri: instagramDirectRedirectUri(origin), scope: SCOPES, state })}`;
}

export async function exchangeCodeForToken(code: string, origin: string): Promise<InstagramCredentials> {
  const shortLived = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: requireEnv("INSTAGRAM_CLIENT_ID"), client_secret: requireEnv("INSTAGRAM_CLIENT_SECRET"), grant_type: "authorization_code", redirect_uri: instagramDirectRedirectUri(origin), code }),
  });
  if (!shortLived.ok) throw new InstagramError(`Instagram token exchange failed: ${await shortLived.text()}`, "platform_error");
  const shortJson = await shortLived.json() as { access_token?: string; user_id?: string };
  if (!shortJson.access_token || !shortJson.user_id) throw new InstagramError("Instagram did not return an access token.", "platform_error");

  // Short-lived tokens expire in ~1h; exchange for a ~60-day one before it's used for anything.
  const longLived = await fetch(`${LONG_LIVED_URL}?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: requireEnv("INSTAGRAM_CLIENT_SECRET"), access_token: shortJson.access_token })}`);
  if (!longLived.ok) throw new InstagramError(`Instagram long-lived token exchange failed: ${await longLived.text()}`, "platform_error");
  const longJson = await longLived.json() as { access_token?: string; expires_in?: number };
  if (!longJson.access_token) throw new InstagramError("Instagram did not return a long-lived access token.", "platform_error");

  return { via: "direct", access_token: longJson.access_token, ig_user_id: shortJson.user_id, expires_at: Date.now() + (longJson.expires_in ?? 60 * 24 * 60 * 60) * 1000 };
}

export async function fetchInstagramProfile(creds: InstagramCredentials): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null }> {
  const res = await fetch(`${GRAPH_URL}/me?${new URLSearchParams({ fields: "user_id,username,name,profile_picture_url", access_token: creds.access_token })}`);
  if (!res.ok) throw new InstagramError(`Could not fetch Instagram profile: ${await res.text()}`, "platform_error");
  const json = await res.json() as { user_id?: string; username?: string; name?: string; profile_picture_url?: string };
  if (!json.user_id || !json.username) throw new InstagramError("Instagram did not return account details.", "platform_error");
  return { id: json.user_id, username: json.username, displayName: json.name || json.username, avatarUrl: json.profile_picture_url ?? null };
}
