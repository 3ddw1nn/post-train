import { randomBytes } from "node:crypto";
import { packOAuthState as packState, requireEnv, unpackOAuthState as unpackState } from "./oauth-state";

const GRAPH_VERSION = "v21.0";
const AUTHORIZE_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_URL = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Instagram Business accounts publish through their linked Facebook Page —
// same app, same Business config_id as lib/facebook.ts (instagram_basic +
// instagram_content_publish were added to that config), just a distinct
// redirect_uri and a Page -> linked IG account lookup after the token
// exchange. See lib/facebook.ts for the twin implementation.
//
// This is one of two ways to connect Instagram — lib/instagram-direct.ts is
// the other (direct Instagram Login, no Facebook Page required). Both store
// into the same "instagram" platform; the `via` tag is what lets
// lib/instagram-publish.ts pick the right Graph API host for each.
export type InstagramCredentials =
  | { via: "facebook"; access_token: string; page_id: string; ig_user_id: string; expires_at: number }
  | { via: "direct"; access_token: string; ig_user_id: string; expires_at: number };
export type OAuthFlowState = { state: string; returnTo: string; reconnect?: number; exp: number };
export class InstagramError extends Error { constructor(message: string, public code: "auth_expired" | "platform_error") { super(message); } }
export const isInstagramError = (error: unknown): error is InstagramError => error instanceof InstagramError;
export const instagramRedirectUri = (origin: string) => `${origin}/api/oauth/instagram/callback`;
export const newCsrfState = () => randomBytes(16).toString("hex");
export const packOAuthState = (data: Omit<OAuthFlowState, "exp">) => packState<OAuthFlowState>(data);
export const unpackOAuthState = (token: string | undefined) => unpackState<OAuthFlowState>(token);

export function authorizeUrl(origin: string, state: string) {
  return `${AUTHORIZE_URL}?${new URLSearchParams({ response_type: "code", client_id: requireEnv("FACEBOOK_CLIENT_ID"), redirect_uri: instagramRedirectUri(origin), config_id: requireEnv("FACEBOOK_CONFIG_ID"), state })}`;
}

export async function exchangeCodeForToken(code: string, origin: string): Promise<InstagramCredentials> {
  const shortLived = await fetch(`${TOKEN_URL}?${new URLSearchParams({ client_id: requireEnv("FACEBOOK_CLIENT_ID"), client_secret: requireEnv("FACEBOOK_CLIENT_SECRET"), redirect_uri: instagramRedirectUri(origin), code })}`);
  if (!shortLived.ok) throw new InstagramError(`Instagram token exchange failed: ${await shortLived.text()}`, "platform_error");
  const shortJson = await shortLived.json() as { access_token?: string };
  if (!shortJson.access_token) throw new InstagramError("Facebook did not return an access token.", "platform_error");

  // Short-lived user tokens expire in ~2h; exchange for a ~60-day one before
  // it's used for anything, since Page tokens minted from it inherit that lifetime.
  const longLived = await fetch(`${TOKEN_URL}?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: requireEnv("FACEBOOK_CLIENT_ID"), client_secret: requireEnv("FACEBOOK_CLIENT_SECRET"), fb_exchange_token: shortJson.access_token })}`);
  if (!longLived.ok) throw new InstagramError(`Instagram long-lived token exchange failed: ${await longLived.text()}`, "platform_error");
  const longJson = await longLived.json() as { access_token?: string; expires_in?: number };
  if (!longJson.access_token) throw new InstagramError("Facebook did not return a long-lived access token.", "platform_error");

  const pagesRes = await fetch(`${GRAPH_URL}/me/accounts?${new URLSearchParams({ fields: "id,access_token,instagram_business_account", access_token: longJson.access_token })}`);
  if (!pagesRes.ok) throw new InstagramError(`Could not list Facebook Pages: ${await pagesRes.text()}`, "platform_error");
  const pagesJson = await pagesRes.json() as { data?: { id?: string; access_token?: string; instagram_business_account?: { id?: string } }[] };
  const page = pagesJson.data?.find((p) => p.instagram_business_account?.id);
  if (!page?.id || !page.access_token || !page.instagram_business_account?.id) throw new InstagramError("No Instagram professional account is linked to a Facebook Page you manage — link one in the Page's settings first.", "platform_error");

  return { via: "facebook", access_token: page.access_token, page_id: page.id, ig_user_id: page.instagram_business_account.id, expires_at: Date.now() + (longJson.expires_in ?? 60 * 24 * 60 * 60) * 1000 };
}

export async function fetchInstagramProfile(creds: InstagramCredentials): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null }> {
  const res = await fetch(`${GRAPH_URL}/${creds.ig_user_id}?${new URLSearchParams({ fields: "id,username,name,profile_picture_url", access_token: creds.access_token })}`);
  if (!res.ok) throw new InstagramError(`Could not fetch Instagram profile: ${await res.text()}`, "platform_error");
  const json = await res.json() as { id?: string; username?: string; name?: string; profile_picture_url?: string };
  if (!json.id || !json.username) throw new InstagramError("Instagram did not return account details.", "platform_error");
  return { id: json.id, username: json.username, displayName: json.name || json.username, avatarUrl: json.profile_picture_url ?? null };
}
