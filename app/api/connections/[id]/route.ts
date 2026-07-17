import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { getDb } from "@/lib/db";

async function ownedAccount(idRaw: string) {
  const user = await requireUser();
  const wsIds = workspacesForUser(user.id).map((w) => w.id);
  const account = getDb()
    .prepare(
      `SELECT * FROM social_accounts WHERE id = ? AND workspace_id IN (${wsIds.map(() => "?").join(",")})`
    )
    .get(Number(idRaw), ...wsIds) as { id: number } | undefined;
  return account ?? null;
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const account = await ownedAccount(id);
  if (!account) {
    return Response.json({ error: { message: "Account not found." } }, { status: 404 });
  }
  // Keep the row for history integrity of past results; mark disconnected.
  // Pending scheduled posts to it will fail at publish time with a clear error (spec 11 §6).
  getDb()
    .prepare("UPDATE social_accounts SET status = 'disconnected' WHERE id = ?")
    .run(account.id);
  return Response.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const account = await ownedAccount(id);
  if (!account) {
    return Response.json({ error: { message: "Account not found." } }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? "");
  if (!["active", "needs_reauth"].includes(status)) {
    return Response.json({ error: { message: "Invalid status." } }, { status: 400 });
  }
  getDb().prepare("UPDATE social_accounts SET status = ? WHERE id = ?").run(status, account.id);
  return Response.json({ ok: true });
}
