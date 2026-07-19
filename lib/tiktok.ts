// TikTok integration — OAuth 2.0 authorization code flow
// Uses the TikTok Content Posting API to publish videos.
// https://developers.tiktok.com/doc/
import { randomBytes } from "node:crypto";
import { sign } from "./auth";

// TikTok deprecated the v1 OAuth endpoints in Sept 2023 — v2 is required now.
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const SCOPES = "video.upload,user.info.basic";

export type TikTokCredentials = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};

class TikTokError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}

export function isTikTokError(e: unknown): e is TikTokError {
  return e instanceof TikTokError;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

export function tiktokRedirectUri(origin: string): string {
  return `${origin}/api/oauth/tiktok/callback`;
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_key: requireEnv("TIKTOK_CLIENT_ID"),
    redirect_uri: tiktokRedirectUri(origin),
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  origin: string
): Promise<TikTokCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_ID"),
      client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: tiktokRedirectUri(origin),
    }),
  });

  if (!res.ok) {
    throw new TikTokError(
      `TikTok token exchange failed: ${await res.text()}`,
      "platform_error"
    );
  }

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    open_id?: string;
    error?: string;
    error_description?: string;
  };

  // TikTok's v2 token endpoint returns HTTP 200 even on failure — the error
  // lives in the body, not the status code.
  if (!json.access_token) {
    throw new TikTokError(
      `TikTok token exchange failed: ${json.error ?? "unknown"} — ${json.error_description ?? JSON.stringify(json)}`,
      "platform_error"
    );
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in ?? 0) * 1000,
  };
}

export async function fetchTikTokProfile(
  accessToken: string
): Promise<{
  id: string;
  username: string;
  avatar: string | null;
}> {
  // user.info.basic scope only returns open_id/union_id/avatar_url/display_name —
  // there's no real @handle without the separate user.info.profile scope.
  const res = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new TikTokError(
      `Could not fetch TikTok profile: ${await res.text()}`,
      "platform_error"
    );
  }

  const json = (await res.json()) as {
    data?: {
      user?: {
        open_id: string;
        display_name: string;
        avatar_url?: string;
      };
    };
  };

  if (!json.data?.user) {
    throw new TikTokError("No TikTok profile data returned", "platform_error");
  }

  return {
    id: json.data.user.open_id,
    username: json.data.user.display_name,
    avatar: json.data.user.avatar_url ?? null,
  };
}

export type OAuthFlowState = {
  state: string;
  returnTo: string;
  reconnect?: number;
  exp: number;
};

export function newCsrfState(): string {
  return randomBytes(16).toString("hex");
}

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
  if (payload.exp < Date.now()) return null;
  return payload;
}
