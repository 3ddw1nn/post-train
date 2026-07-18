import { requireUser } from "@/lib/auth";
import { deleteRecord, deleteRecords, findRecord, listRecords, patchRecord } from "@/lib/db";

async function ownedWorkspace(id: string, userId: string) {
  return await findRecord<{ id: string }>("workspaces", { id, owner_id: userId });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!(await ownedWorkspace(id, user.id))) {
    return Response.json({ error: { message: "Workspace not found." } }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return Response.json({ error: { message: "Name is required." } }, { status: 400 });
  }
  await patchRecord("workspaces", id, { name: name.slice(0, 60) });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!(await ownedWorkspace(id, user.id))) {
    return Response.json({ error: { message: "Workspace not found." } }, { status: 404 });
  }
  const owned = await listRecords("workspaces", { owner_id: user.id });
  if (owned.length <= 1) {
    return Response.json(
      { error: { message: "You need at least one workspace." } },
      { status: 400 }
    );
  }
  const hasPosts = await listRecords("posts", { workspace_id: id });
  if (hasPosts.length > 0) {
    return Response.json(
      { error: { message: "Delete or move this workspace's posts first." } },
      { status: 400 }
    );
  }
  await deleteRecords("queue_slots", { workspace_id: id });
  await deleteRecords("social_accounts", { workspace_id: id });
  await deleteRecords("api_keys", { workspace_id: id });
  await deleteRecords("workspace_members", { workspace_id: id });
  await deleteRecord("workspaces", id);
  return Response.json({ ok: true });
}
