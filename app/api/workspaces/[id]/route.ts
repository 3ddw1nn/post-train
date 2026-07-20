import { requireUser } from "@/lib/auth";
import { deleteRecord, deleteRecords, findRecord, listRecords, patchRecord } from "@/lib/db";

async function ownedWorkspace(id: string, userId: string) {
  return await findRecord<{ id: string; name: string }>("workspaces", { id, owner_id: userId });
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

/**
 * Permanently deletes a workspace and everything scoped to it: members, teams,
 * connected accounts, posts (and their destinations/results/media links), media
 * library, analytics, studio jobs, queue slots, API keys and webhook history.
 * Owner-only; requires typing the workspace's exact name to confirm.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const ws = await ownedWorkspace(id, user.id);
  if (!ws) {
    return Response.json({ error: { message: "Workspace not found." } }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const confirmName = String(body?.confirm_name ?? "");
  if (confirmName !== ws.name) {
    return Response.json(
      { error: { message: "Type the workspace name exactly to confirm deletion." } },
      { status: 400 }
    );
  }

  const posts = await listRecords<{ id: string }>("posts", { workspace_id: id });
  for (const post of posts) {
    await deleteRecords("post_destinations", { post_id: post.id });
    await deleteRecords("post_results", { post_id: post.id });
    await deleteRecords("post_media", { post_id: post.id });
  }
  await deleteRecords("posts", { workspace_id: id });

  const teams = await listRecords<{ id: string }>("teams", { workspace_id: id });
  for (const team of teams) {
    await deleteRecords("team_members", { team_id: team.id });
  }
  await deleteRecords("teams", { workspace_id: id });

  await deleteRecords("media", { workspace_id: id });
  await deleteRecords("analytics_records", { workspace_id: id });
  await deleteRecords("studio_jobs", { workspace_id: id });
  await deleteRecords("webhook_deliveries", { workspace_id: id });
  await deleteRecords("queue_slots", { workspace_id: id });
  await deleteRecords("social_accounts", { workspace_id: id });
  await deleteRecords("api_keys", { workspace_id: id });
  await deleteRecords("workspace_members", { workspace_id: id });
  await deleteRecord("workspaces", id);
  return Response.json({ ok: true });
}
