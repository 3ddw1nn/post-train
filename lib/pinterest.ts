// Pinterest integration — OAuth 2.0 authorization code flow
// Uses the Pins API to create pins on a user's Pinterest board.
// https://developers.pinterest.com/docs/api/overview/
import { randomBytes } from "node:crypto";
import { requireEnv, packOAuthState as packState, unpackOAuthState as unpackState } from "./oauth-state";

const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const SCOPES = "boards:read,boards:write,pins:read,pins:write,user_accounts:read";

export type PinterestCredentials = {
  access_token: string;
  expires_at: number;
  refresh_token: string;
  refresh_token_expires_at: number | null;
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
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${requireEnv("PINTEREST_CLIENT_ID")}:${requireEnv("PINTEREST_CLIENT_SECRET")}`
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pinterestRedirectUri(origin),
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
    refresh_token?: string;
    refresh_token_expires_at?: number;
  };

  if (!json.refresh_token) {
    throw new PinterestError("Pinterest did not return a refresh token.", "platform_error");
  }

  return {
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
    refresh_token: json.refresh_token,
    refresh_token_expires_at: json.refresh_token_expires_at ?? null,
  };
}

export async function refreshPinterestToken(
  credentials: PinterestCredentials
): Promise<PinterestCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${requireEnv("PINTEREST_CLIENT_ID")}:${requireEnv("PINTEREST_CLIENT_SECRET")}`
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
    }),
  });

  if (!res.ok) {
    throw new PinterestError(
      `Pinterest token refresh failed: ${await res.text()}`,
      res.status === 401 ? "auth_expired" : "platform_error"
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_at?: number;
  };
  return {
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
    refresh_token: json.refresh_token ?? credentials.refresh_token,
    refresh_token_expires_at: json.refresh_token_expires_at ?? credentials.refresh_token_expires_at,
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
    "https://api.pinterest.com/v5/user_account",
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
    id?: string;
    username?: string;
    profile_image?: string;
  };

  if (!json.id || !json.username) {
    throw new PinterestError("No Pinterest profile data returned", "platform_error");
  }

  return {
    id: json.id,
    username: json.username,
    image: json.profile_image ?? null,
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
  return packState<OAuthFlowState>(data);
}

export function unpackOAuthState(token: string | undefined): OAuthFlowState | null {
  return unpackState<OAuthFlowState>(token);
}
