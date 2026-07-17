import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { platform as platformOf } from "@/lib/platforms";
import { getDb, now } from "@/lib/db";
import { randomBytes } from "node:crypto";

// Completes the simulated OAuth flow: creates (or refreshes) a social account.
export async function POST(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const p = platformOf(String(body?.platform ?? ""));
  const username = String(body?.username ?? "").replace(/^@/, "").trim();
  if (!p || !username) {
    return Response.json({ error: { message: "Invalid platform or username." } }, { status: 400 });
  }
  const db = getDb();

  if (body?.reconnect) {
    const id = Number(body.reconnect);
    const row = db
      .prepare("SELECT id FROM social_accounts WHERE id = ? AND workspace_id = ?")
      .get(id, ws.id);
    if (!row) {
      return Response.json({ error: { message: "Account not found." } }, { status: 404 });
    }
    db.prepare(
      "UPDATE social_accounts SET status = 'active', username = ? WHERE id = ?"
    ).run(username, id);
    return Response.json({ ok: true });
  }

  // Plan cap check at connect time (15 / 50 / ∞, small free cap)
  const sub = getSubscription(user.id);
  const cap = maxAccounts(sub);
  const count = (
    db
      .prepare(
        "SELECT COUNT(*) c FROM social_accounts WHERE workspace_id = ? AND status != 'disconnected'"
      )
      .get(ws.id) as { c: number }
  ).c;
  if (count >= cap) {
    return Response.json(
      {
        error: {
          message: `Your plan allows ${cap} connected account${cap === 1 ? "" : "s"}. Upgrade to connect more.`,
          code: "plan_limit",
        },
      },
      { status: 403 }
    );
  }

  db.prepare(
    `INSERT INTO social_accounts (workspace_id, platform, username, display_name, platform_account_id, status, connected_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  ).run(ws.id, p.id, username, username, randomBytes(8).toString("hex"), now());
  return Response.json({ ok: true });
}
