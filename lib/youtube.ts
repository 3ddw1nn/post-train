// YouTube integration — OAuth 2.0 via Google (same credentials as Google sign-in)
// Uses the YouTube Data API v3 to publish videos and fetch channel info.
//
// Scopes: https://www.googleapis.com/auth/youtube.upload (upload videos)
//         https://www.googleapis.com/auth/youtube.readonly (read channel/videos)
import { randomBytes } from "node:crypto";
import { sign } from "./auth";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

export type YouTubeCredentials = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};

class YouTubeError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}

export function isYouTubeError(e: unknown): e is YouTubeError {
  return e instanceof YouTubeError;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

export function youtubeRedirectUri(origin: string): string {
  return `${origin}/api/oauth/youtube/callback`;
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: youtubeRedirectUri(origin),
    scope: SCOPES,
    state,
    access_type: "offline",
    prompt: "consent", // force refresh token on re-auth
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCodeForToken(code: string, origin: string): Promise<YouTubeCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: youtubeRedirectUri(origin),
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    throw new YouTubeError(`YouTube token exchange failed: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  refreshToken: string | undefined
): Promise<YouTubeCredentials | null> {
  if (!refreshToken) return null;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    return {
      access_token: json.access_token,
      refresh_token: refreshToken,
      expires_at: Date.now() + json.expires_in * 1000,
    };
  } catch {
    return null;
  }
}

export async function fetchYouTubeChannelInfo(
  accessToken: string
): Promise<{
  channelId: string;
  title: string;
  thumbnail: string | null;
}> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new YouTubeError(`Could not fetch YouTube channel: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet: { title: string; thumbnails?: { default?: { url: string } } };
    }>;
  };
  const channel = json.items?.[0];
  if (!channel) throw new YouTubeError("No YouTube channel found", "platform_error");
  return {
    channelId: channel.id,
    title: channel.snippet.title,
    thumbnail: channel.snippet.thumbnails?.default?.url ?? null,
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
