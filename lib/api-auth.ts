// Public API v1 auth: Bearer pt_live_… keys, workspace-scoped, gated on the
// API add-on + an active subscription (spec 09).
import { createHash } from "node:crypto";
import { getDb, now } from "./db";
import type { User } from "./auth";
import { getSubscription } from "./billing";
import { apiAccess } from "./entitlements";
import type { Workspace } from "./workspaces";
import { DomainError } from "./posts";

export const API_KEY_PREFIX = "pt_live_";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export type ApiContext = { user: User; workspace: Workspace; keyId: string };

// ponytail: in-memory fixed-window rate limit (60 req/min/key) — resets on server
// restart, single-node only. Upgrade path: shared store (Redis) keyed by key id.
const buckets = new Map<string, { windowStart: number; count: number }>();
const RATE_LIMIT = 60;

export function authenticateApiKey(req: Request): ApiContext {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].startsWith(API_KEY_PREFIX)) {
    throw new DomainError(401, "Missing or invalid API key.");
  }
  const db = getDb();
  const key = db
    .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(hashKey(match[1])) as { id: string; workspace_id: string } | undefined;
  if (!key) throw new DomainError(401, "Missing or invalid API key.");

  const bucket = buckets.get(key.id);
  const windowStart = Math.floor(Date.now() / 60_000);
  if (bucket && bucket.windowStart === windowStart) {
    if (++bucket.count > RATE_LIMIT) throw new DomainError(429, "Rate limit exceeded. Retry in a minute.");
  } else {
    buckets.set(key.id, { windowStart, count: 1 });
  }

  const workspace = db
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(key.workspace_id) as Workspace;
  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(workspace.owner_id) as User;
  const sub = getSubscription(user.id);
  if (!apiAccess(sub)) {
    throw new DomainError(403, "API add-on inactive or subscription not active.");
  }
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), key.id);
  return { user, workspace, keyId: key.id };
}

export function jsonError(e: unknown): Response {
  if (e instanceof DomainError) {
    return Response.json(
      { error: { message: e.message, ...(e.code ? { code: e.code } : {}) } },
      { status: e.status }
    );
  }
  console.error("[api] unexpected error", e);
  return Response.json({ error: { message: "Internal error." } }, { status: 500 });
}
