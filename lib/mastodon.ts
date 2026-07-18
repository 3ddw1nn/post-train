// Real Mastodon integration. Unlike Twitter/Bluesky, Mastodon has no central
// developer console — any app can dynamically register itself with a user's
// instance at connect time (POST /api/v1/apps), so there's no manual setup
// or approval wait at all.
//
// ponytail: text-only for now, same media-upload gap as lib/twitter.ts.
import { sign } from "./auth";

class MastodonError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}
export function isMastodonError(e: unknown): e is MastodonError {
  return e instanceof MastodonError;
}

/**
 * Standard Mastodon client convention: ask for the server, not the username
 * (the OAuth redirect needs to know the server before anything else; the
 * username itself is discovered after the user authorizes). Accepts
 * "mastodon.social", "@user@mastodon.social", or "https://mastodon.social/" —
 * all normalize to "mastodon.social".
 */
export function normalizeInstance(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
  return cleaned.split("@").pop()!.toLowerCase();
}

export type MastodonApp = { client_id: string; client_secret: string };

export async function registerApp(instance: string, redirectUri: string): Promise<MastodonApp> {
  const res = await fetch(`https://${instance}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Post Train",
      redirect_uris: redirectUri,
      scopes: "read write",
      website: process.env.NEXT_PUBLIC_APP_URL,
    }),
  });
  if (!res.ok) {
    throw new MastodonError(`Could not register with ${instance}: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as { client_id: string; client_secret: string };
  return { client_id: json.client_id, client_secret: json.client_secret };
}

export function authorizeUrl(instance: string, app: MastodonApp, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: app.client_id,
    redirect_uri: redirectUri,
    scope: "read write",
    state,
  });
  return `https://${instance}/oauth/authorize?${params}`;
}

export type MastodonCredentials = { instance: string; access_token: string };

export async function exchangeCodeForToken(
  instance: string,
  app: MastodonApp,
  code: string,
  redirectUri: string
): Promise<string> {
  const res = await fetch(`https://${instance}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: app.client_id,
      client_secret: app.client_secret,
      redirect_uri: redirectUri,
      scope: "read write",
    }),
  });
  if (!res.ok) {
    throw new MastodonError(`Token exchange with ${instance} failed: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function fetchMastodonProfile(
  instance: string,
  accessToken: string
): Promise<{ id: string; username: string; display_name: string; avatar: string | null }> {
  const res = await fetch(`https://${instance}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new MastodonError(`Could not fetch ${instance} profile: ${await res.text()}`, "platform_error");
  return (await res.json()) as { id: string; username: string; display_name: string; avatar: string | null };
}

export type MastodonPublishResult = { platform_post_id: string; share_url: string };

export async function publishToMastodon(creds: MastodonCredentials, username: string, text: string): Promise<MastodonPublishResult> {
  const res = await fetch(`https://${creds.instance}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: text }),
  });
  if (res.status === 401) {
    throw new MastodonError("Mastodon access expired — reconnect this account.", "auth_expired");
  }
  if (!res.ok) {
    throw new MastodonError(`Mastodon post failed: ${await res.text()}`, "platform_error");
  }
  const json = (await res.json()) as { id: string; url: string };
  return { platform_post_id: json.id, share_url: json.url };
}

// Signed, short-lived carrier for the dynamically-registered app credentials +
// return path across the OAuth redirect (mirrors lib/twitter.ts's OAuthFlowState).
export type MastodonFlowState = {
  instance: string;
  clientId: string;
  clientSecret: string;
  state: string;
  returnTo: string;
  reconnect?: number;
  exp: number;
};

export function packFlowState(data: Omit<MastodonFlowState, "exp">): string {
  const payload: MastodonFlowState = { ...data, exp: Date.now() + 10 * 60_000 };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function unpackFlowState(token: string | undefined): MastodonFlowState | null {
  if (!token) return null;
  const [json, mac] = token.split(".");
  if (!json || !mac || sign(json) !== mac) return null;
  const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as MastodonFlowState;
  if (Date.now() > payload.exp) return null;
  return payload;
}
