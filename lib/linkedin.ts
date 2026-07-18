// Real LinkedIn integration — standard OAuth 2.0 authorization code flow
// (no PKCE required) via LinkedIn's "Sign In with LinkedIn using OpenID
// Connect" + "Share on LinkedIn" products. Profile via OpenID /userinfo,
// posting via the UGC Posts API.
//
// ponytail: text-only for now, same media-upload gap as lib/twitter.ts —
// images/video need LinkedIn's separate assets registerUpload flow.
import { randomBytes } from "node:crypto";
import { sign } from "./auth";

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const SCOPES = "openid profile w_member_social";

export type LinkedInCredentials = {
  access_token: string;
  expires_at: number; // epoch ms
};

class LinkedInError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}
export function isLinkedInError(e: unknown): e is LinkedInError {
  return e instanceof LinkedInError;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

export function linkedinRedirectUri(): string {
  return requireEnv("LINKEDIN_REDIRECT_URI");
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("LINKEDIN_CLIENT_ID"),
    redirect_uri: linkedinRedirectUri(),
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<LinkedInCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: linkedinRedirectUri(),
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    throw new LinkedInError(`LinkedIn token exchange failed: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { access_token: json.access_token, expires_at: Date.now() + json.expires_in * 1000 };
}

export async function fetchLinkedInProfile(
  accessToken: string
): Promise<{ sub: string; name: string; picture: string | null }> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new LinkedInError(`Could not fetch LinkedIn profile: ${await res.text()}`, "platform_error");
  const json = (await res.json()) as { sub: string; name: string; picture?: string };
  return { sub: json.sub, name: json.name, picture: json.picture ?? null };
}

export type OAuthFlowState = {
  state: string;
  returnTo: string;
  reconnect?: number;
  exp: number;
};

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

export function newCsrfState(): string {
  return randomBytes(16).toString("hex");
}

export type LinkedInPublishResult = { platform_post_id: string; share_url: string };

export async function publishToLinkedIn(
  creds: LinkedInCredentials,
  authorSub: string,
  text: string
): Promise<LinkedInPublishResult> {
  const author = `urn:li:person:${authorSub}`;
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (res.status === 401) {
    throw new LinkedInError("LinkedIn access expired — reconnect this account.", "auth_expired");
  }
  if (!res.ok) {
    throw new LinkedInError(`LinkedIn post failed: ${await res.text()}`, "platform_error");
  }
  const postId = res.headers.get("x-restli-id") ?? (await res.json().catch(() => null))?.id;
  if (!postId) throw new LinkedInError("LinkedIn post succeeded but returned no post ID.", "platform_error");
  return {
    platform_post_id: postId,
    share_url: `https://www.linkedin.com/feed/update/${postId}`,
  };
}
