import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

function ownedWorkspace(id: string, userId: string) {
  return getDb()
    .prepare("SELECT * FROM workspaces WHERE id = ? AND owner_id = ?")
    .get(id, userId) as { id: string } | undefined;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!ownedWorkspace(id, user.id)) {
    return Response.json({ error: { message: "Workspace not found." } }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return Response.json({ error: { message: "Name is required." } }, { status: 400 });
  }
  getDb().prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(name.slice(0, 60), id);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!ownedWorkspace(id, user.id)) {
    return Response.json({ error: { message: "Workspace not found." } }, { status: 404 });
  }
  const db = getDb();
  const owned = db
    .prepare("SELECT COUNT(*) c FROM workspaces WHERE owner_id = ?")
    .get(user.id) as { c: number };
  if (owned.c <= 1) {
    return Response.json(
      { error: { message: "You need at least one workspace." } },
      { status: 400 }
    );
  }
  const hasPosts = db
    .prepare("SELECT COUNT(*) c FROM posts WHERE workspace_id = ?")
    .get(id) as { c: number };
  if (hasPosts.c > 0) {
    return Response.json(
      { error: { message: "Delete or move this workspace's posts first." } },
      { status: 400 }
    );
  }
  db.prepare("DELETE FROM queue_slots WHERE workspace_id = ?").run(id);
  db.prepare("DELETE FROM social_accounts WHERE workspace_id = ?").run(id);
  db.prepare("DELETE FROM api_keys WHERE workspace_id = ?").run(id);
  db.prepare("DELETE FROM workspace_members WHERE workspace_id = ?").run(id);
  db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  return Response.json({ ok: true });
}
