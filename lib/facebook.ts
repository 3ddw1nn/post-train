import { randomBytes } from "node:crypto";
import { packOAuthState as packState, requireEnv, unpackOAuthState as unpackState } from "./oauth-state";

const GRAPH_VERSION = "v21.0";
const AUTHORIZE_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_URL = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Page access token, not the user token — publishing happens as the Page.
// ponytail: connects the user's first Page only (mirrors lib/tumblr.ts's
// primary-blog pick). A user managing multiple Pages can't pick which one
// here; add a page picker in the callback if that's ever needed.
export type FacebookCredentials = { access_token: string; page_id: string; expires_at: number };
export type OAuthFlowState = { state: string; returnTo: string; reconnect?: number; exp: number };
export class FacebookError extends Error { constructor(message: string, public code: "auth_expired" | "platform_error") { super(message); } }
export const isFacebookError = (error: unknown): error is FacebookError => error instanceof FacebookError;
export const facebookRedirectUri = (origin: string) => `${origin}/api/oauth/facebook/callback`;
export const newCsrfState = () => randomBytes(16).toString("hex");
export const packOAuthState = (data: Omit<OAuthFlowState, "exp">) => packState<OAuthFlowState>(data);
export const unpackOAuthState = (token: string | undefined) => unpackState<OAuthFlowState>(token);

export function authorizeUrl(origin: string, state: string) {
  return `${AUTHORIZE_URL}?${new URLSearchParams({ response_type: "code", client_id: requireEnv("FACEBOOK_CLIENT_ID"), redirect_uri: facebookRedirectUri(origin), config_id: requireEnv("FACEBOOK_CONFIG_ID"), state })}`;
}

export async function exchangeCodeForToken(code: string, origin: string): Promise<FacebookCredentials> {
  const shortLived = await fetch(`${TOKEN_URL}?${new URLSearchParams({ client_id: requireEnv("FACEBOOK_CLIENT_ID"), client_secret: requireEnv("FACEBOOK_CLIENT_SECRET"), redirect_uri: facebookRedirectUri(origin), code })}`);
  if (!shortLived.ok) throw new FacebookError(`Facebook token exchange failed: ${await shortLived.text()}`, "platform_error");
  const shortJson = await shortLived.json() as { access_token?: string };
  if (!shortJson.access_token) throw new FacebookError("Facebook did not return an access token.", "platform_error");

  // Short-lived user tokens expire in ~2h; exchange for a ~60-day one before
  // it's used for anything, since Page tokens minted from it inherit that lifetime.
  const longLived = await fetch(`${TOKEN_URL}?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: requireEnv("FACEBOOK_CLIENT_ID"), client_secret: requireEnv("FACEBOOK_CLIENT_SECRET"), fb_exchange_token: shortJson.access_token })}`);
  if (!longLived.ok) throw new FacebookError(`Facebook long-lived token exchange failed: ${await longLived.text()}`, "platform_error");
  const longJson = await longLived.json() as { access_token?: string; expires_in?: number };
  if (!longJson.access_token) throw new FacebookError("Facebook did not return a long-lived access token.", "platform_error");

  const pagesRes = await fetch(`${GRAPH_URL}/me/accounts?${new URLSearchParams({ access_token: longJson.access_token })}`);
  if (!pagesRes.ok) throw new FacebookError(`Could not list Facebook Pages: ${await pagesRes.text()}`, "platform_error");
  const pagesJson = await pagesRes.json() as { data?: { id?: string; access_token?: string }[] };
  const page = pagesJson.data?.[0];
  if (!page?.id || !page.access_token) throw new FacebookError("No Facebook Page is available to connect — this account must be an admin of at least one Page.", "platform_error");

  return { access_token: page.access_token, page_id: page.id, expires_at: Date.now() + (longJson.expires_in ?? 60 * 24 * 60 * 60) * 1000 };
}

export async function fetchFacebookProfile(creds: FacebookCredentials): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null }> {
  const res = await fetch(`${GRAPH_URL}/${creds.page_id}?${new URLSearchParams({ fields: "id,name,username,picture", access_token: creds.access_token })}`);
  if (!res.ok) throw new FacebookError(`Could not fetch Facebook Page profile: ${await res.text()}`, "platform_error");
  const json = await res.json() as { id?: string; name?: string; username?: string; picture?: { data?: { url?: string } } };
  if (!json.id || !json.name) throw new FacebookError("Facebook did not return Page details.", "platform_error");
  // Pages only have a @handle once a vanity URL is set; fall back to the name.
  return { id: json.id, username: json.username ?? json.name, displayName: json.name, avatarUrl: json.picture?.data?.url ?? null };
}
