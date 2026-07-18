// Real Twitter/X integration — OAuth 2.0 (PKCE, confidential client) for user
// auth and tweet creation via API v2.
//
// ponytail: text-only for now. Media attachment needs the v1.1 media upload
// endpoint, which requires a separate OAuth 1.0a three-legged flow (its own
// request-token/authorize/access-token round trip) — real but meaningfully
// more code than the OAuth 2.0 flow here. Upgrade path: add that second flow,
// store the resulting oauth_token/oauth_token_secret alongside the OAuth 2.0
// tokens in the same encrypted `credentials` blob, and upload media before
// creating the tweet.
import { randomBytes, createHash } from "node:crypto";
import { sign } from "./auth";

const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const SCOPES = "tweet.read tweet.write users.read offline.access";

export type TwitterCredentials = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
};

class TwitterError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}
export function isTwitterError(e: unknown): e is TwitterError {
  return e instanceof TwitterError;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

export function twitterRedirectUri(): string {
  return requireEnv("TWITTER_REDIRECT_URI");
}

export function authorizeUrl(opts: { state: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("TWITTER_CLIENT_ID"),
    redirect_uri: twitterRedirectUri(),
    scope: SCOPES,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

function basicAuthHeader(): string {
  const id = requireEnv("TWITTER_CLIENT_ID");
  const secret = requireEnv("TWITTER_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<TwitterCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: twitterRedirectUri(),
      code_verifier: codeVerifier,
      client_id: requireEnv("TWITTER_CLIENT_ID"),
    }),
  });
  if (!res.ok) {
    throw new TwitterError(`Twitter token exchange failed: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
}

async function refreshToken(creds: TwitterCredentials): Promise<TwitterCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
      client_id: requireEnv("TWITTER_CLIENT_ID"),
    }),
  });
  if (!res.ok) {
    throw new TwitterError(`Twitter token refresh failed: ${await res.text()}`, "auth_expired");
  }
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? creds.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
}

/** Refreshes and returns updated creds if the access token is expired/near-expiry, else returns as-is. */
export async function ensureFreshToken(creds: TwitterCredentials): Promise<TwitterCredentials> {
  if (creds.expires_at > Date.now() + 60_000) return creds;
  return await refreshToken(creds);
}

export async function fetchTwitterProfile(
  accessToken: string
): Promise<{ id: string; username: string; name: string; profile_image_url: string | null }> {
  const res = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new TwitterError(`Could not fetch Twitter profile: ${await res.text()}`, "platform_error");
  const json = (await res.json()) as {
    data: { id: string; username: string; name: string; profile_image_url?: string };
  };
  // X returns the low-res "_normal" thumbnail by default; swap for the full-size original.
  const avatar = json.data.profile_image_url?.replace("_normal.", ".") ?? null;
  return { ...json.data, profile_image_url: avatar };
}

export type OAuthFlowState = {
  verifier: string;
  state: string;
  returnTo: string;
  reconnect?: number;
  exp: number;
};

/** Signed, short-lived carrier for PKCE verifier + return path across the OAuth redirect. */
export function packOAuthState(data: Omit<OAuthFlowState, "exp">): string {
  const payload: OAuthFlowState = { ...data, exp: Date.now() + 10 * 60_000 };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function unpackOAuthState(token: string | undefined): OAuthFlowState | null {
  if (!token) return null;
  const [json, mac] = token.split(".");
  if (!json || !mac || sign(json) !== mac) return null;
  const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as OAuthFlowState;
  if (Date.now() > payload.exp) return null;
  return payload;
}

export type TwitterPublishResult = { platform_post_id: string; share_url: string };

export async function publishToTwitter(
  creds: TwitterCredentials,
  username: string,
  text: string
): Promise<{ result: TwitterPublishResult; refreshedCreds: TwitterCredentials | null }> {
  const fresh = await ensureFreshToken(creds);
  const refreshedCreds = fresh.access_token !== creds.access_token ? fresh : null;

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${fresh.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (res.status === 401) {
    throw new TwitterError("Twitter access expired — reconnect this account.", "auth_expired");
  }
  if (!res.ok) {
    throw new TwitterError(`Twitter post failed: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as { data: { id: string } };
  return {
    result: {
      platform_post_id: json.data.id,
      share_url: `https://x.com/${username}/status/${json.data.id}`,
    },
    refreshedCreds,
  };
}
