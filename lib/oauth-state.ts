// Shared by every OAuth connect flow (lib/linkedin.ts, pinterest.ts,
// twitter.ts, tiktok.ts, youtube.ts) — each used to carry its own copy of
// these two. Generic over the platform's own state shape (twitter's carries
// an extra PKCE `verifier` field the others don't) since only the envelope
// (sign, base64url-encode, expiry-check) was ever duplicated, not the payload.
import { sign } from "./auth";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

/** Signed, short-lived (10 min) carrier for OAuth state across the redirect. */
export function packOAuthState<T extends { exp: number }>(data: Omit<T, "exp">): string {
  const payload = { ...data, exp: Date.now() + 10 * 60_000 } as T;
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function unpackOAuthState<T extends { exp: number }>(token: string | undefined): T | null {
  if (!token) return null;
  const [json, mac] = token.split(".");
  if (!json || !mac || sign(json) !== mac) return null;
  const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as T;
  if (Date.now() > payload.exp) return null;
  return payload;
}
