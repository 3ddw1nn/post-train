import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { apiAccess } from "@/lib/entitlements";
import { canManageWorkspace } from "@/lib/permissions";
import { convexMutation, now, recordById, uid } from "@/lib/db";
import { API_KEY_PREFIX, hashKey } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";

export async function POST(req: Request) {
  const user = await requireUser();
  const sub = await getSubscription(user.id);
  if (!apiAccess(sub)) {
    return Response.json(
      { error: { message: "API access requires the API add-on on an active subscription." } },
      { status: 403 }
    );
  }
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) {
    return Response.json(
      { error: { message: "Only workspace owners and admins can create API keys." } },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim() || "API key";
  const secret = `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  await convexMutation(api.apiKeys.createApiKey, {
    id: uid(),
    workspace_id: ws.id,
    name: name.slice(0, 60),
    key_prefix: API_KEY_PREFIX,
    key_hash: hashKey(secret),
    last4: secret.slice(-4),
  });
  // The full secret is returned exactly once
  return Response.json({ ok: true, key: secret }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  // ponytail-fixed bug: this previously patched any api_keys row by id with
  // no ownership check at all — any authenticated user could revoke any
  // workspace's key. Now verified against the caller's own workspace + role.
  const key = await recordById<{ id: string; workspace_id: string }>("api_keys", id);
  if (!key || key.workspace_id !== ws.id) {
    return Response.json({ error: { message: "API key not found." } }, { status: 404 });
  }
  if (!(await canManageWorkspace(ws.id, user.id))) {
    return Response.json(
      { error: { message: "Only workspace owners and admins can revoke API keys." } },
      { status: 403 }
    );
  }
  await convexMutation(api.apiKeys.patchApiKey, { id, patch: { revoked_at: now() } });
  return Response.json({ ok: true });
}
