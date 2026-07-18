// Public API v1 auth: Bearer pt_live_… keys, workspace-scoped, gated on the
// API add-on + an active subscription (spec 09).
import { createHash } from "node:crypto";
import { convexMutation, convexQuery, now } from "./db";
import type { User } from "./auth";
import { getSubscription } from "./billing";
import { apiAccess } from "./entitlements";
import type { Workspace } from "./workspaces";
import { DomainError } from "./posts";
import { api } from "@/convex/_generated/api";

export const API_KEY_PREFIX = "pt_live_";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export type ApiContext = { user: User; workspace: Workspace; keyId: string };

// ponytail: in-memory fixed-window rate limit (60 req/min/key) — resets on server
// restart, single-node only. Upgrade path: shared store (Redis) keyed by key id.
const buckets = new Map<string, { windowStart: number; count: number }>();
const RATE_LIMIT = 60;

export async function authenticateApiKey(req: Request): Promise<ApiContext> {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].startsWith(API_KEY_PREFIX)) {
    throw new DomainError(401, "Missing or invalid API key.");
  }
  const key = await convexQuery<{ id: string; workspace_id: string } | null>(api.apiKeys.getByHash, {
    key_hash: hashKey(match[1]),
  });
  if (!key) throw new DomainError(401, "Missing or invalid API key.");

  const bucket = buckets.get(key.id);
  const windowStart = Math.floor(Date.now() / 60_000);
  if (bucket && bucket.windowStart === windowStart) {
    if (++bucket.count > RATE_LIMIT) throw new DomainError(429, "Rate limit exceeded. Retry in a minute.");
  } else {
    buckets.set(key.id, { windowStart, count: 1 });
  }

  const workspace = await convexQuery<Workspace | null>(api.records.getByLegacyId, {
    table: "workspaces",
    id: key.workspace_id,
  });
  if (!workspace) throw new DomainError(401, "Missing or invalid API key.");
  const user = await convexQuery<User | null>(api.auth.getUserById, { id: workspace.owner_id });
  if (!user) throw new DomainError(401, "Missing or invalid API key.");
  const sub = await getSubscription(user.id);
  if (!apiAccess(sub)) {
    throw new DomainError(403, "API add-on inactive or subscription not active.");
  }
  await convexMutation(api.apiKeys.patchApiKey, { id: key.id, patch: { last_used_at: now() } });
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
