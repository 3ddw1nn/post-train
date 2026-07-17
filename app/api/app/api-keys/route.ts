import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { apiAccess } from "@/lib/entitlements";
import { getDb, now, uid } from "@/lib/db";
import { API_KEY_PREFIX, hashKey } from "@/lib/api-auth";

export async function POST(req: Request) {
  const user = await requireUser();
  const sub = getSubscription(user.id);
  if (!apiAccess(sub)) {
    return Response.json(
      { error: { message: "API access requires the API add-on on an active subscription." } },
      { status: 403 }
    );
  }
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim() || "API key";
  const secret = `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  getDb()
    .prepare(
      `INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, last4, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(uid(), ws.id, name.slice(0, 60), API_KEY_PREFIX, hashKey(secret), secret.slice(-4), now());
  // The full secret is returned exactly once
  return Response.json({ ok: true, key: secret }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  getDb()
    .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND workspace_id = ?")
    .run(now(), String(body?.id ?? ""), ws.id);
  return Response.json({ ok: true });
}
