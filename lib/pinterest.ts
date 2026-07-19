// Pinterest integration — OAuth 2.0 authorization code flow
// Uses the Pins API to create pins on a user's Pinterest board.
// https://developers.pinterest.com/docs/api/overview/
import { randomBytes } from "node:crypto";
import { sign } from "./auth";

const AUTHORIZE_URL = "https://api.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v1/oauth/token";
const SCOPES = "pins:read,pins:write,user_accounts:read";

export type PinterestCredentials = {
  access_token: string;
  expires_at: number;
};

class PinterestError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}

export function isPinterestError(e: unknown): e is PinterestError {
  return e instanceof PinterestError;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

export function pinterestRedirectUri(origin: string): string {
  return `${origin}/api/oauth/pinterest/callback`;
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("PINTEREST_CLIENT_ID"),
    redirect_uri: pinterestRedirectUri(origin),
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  origin: string
): Promise<PinterestCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pinterestRedirectUri(origin),
      client_id: requireEnv("PINTEREST_CLIENT_ID"),
      client_secret: requireEnv("PINTEREST_CLIENT_SECRET"),
    }),
  });

  if (!res.ok) {
    throw new PinterestError(
      `Pinterest token exchange failed: ${await res.text()}`,
      "platform_error"
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
}

export async function fetchPinterestProfile(
  accessToken: string
): Promise<{
  id: string;
  username: string;
  image: string | null;
}> {
  const res = await fetch(
    "https://api.pinterest.com/v1/user/me?fields=id,username,image",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new PinterestError(
      `Could not fetch Pinterest profile: ${await res.text()}`,
      "platform_error"
    );
  }

  const json = (await res.json()) as {
    data?: {
      id: string;
      username: string;
      image?: string;
    };
  };

  if (!json.data) {
    throw new PinterestError("No Pinterest profile data returned", "platform_error");
  }

  return {
    id: json.data.id,
    username: json.data.username,
    image: json.data.image ?? null,
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
