import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { canManageWorkspace, isWorkspaceOwner } from "@/lib/permissions";
import { convexMutation } from "@/lib/db";
import { api } from "@/convex/_generated/api";

const FORBIDDEN = Response.json(
  { error: { message: "Only workspace owners and admins can manage members." } },
  { status: 403 }
);

/** Change a member's role (owner/admin only; the workspace owner can't be demoted). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) return FORBIDDEN;

  const body = await req.json().catch(() => null);
  const targetUserId = String(body?.user_id ?? "");
  const role = String(body?.role ?? "");
  if (!["admin", "member"].includes(role)) {
    return Response.json({ error: { message: "Invalid role." } }, { status: 400 });
  }
  if (await isWorkspaceOwner(ws.id, targetUserId)) {
    return Response.json({ error: { message: "The workspace owner's role can't be changed." } }, { status: 400 });
  }
  await convexMutation(api.workspaces.changeRole, { workspace_id: ws.id, user_id: targetUserId, role });
  return Response.json({ ok: true });
}

/** Remove a member from the workspace (owner/admin only; the workspace owner can't be removed). */
export async function DELETE(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) return FORBIDDEN;

  const body = await req.json().catch(() => null);
  const targetUserId = String(body?.user_id ?? "");
  const teamMemberId = Number(body?.team_member_id);
  if (await isWorkspaceOwner(ws.id, targetUserId)) {
    return Response.json({ error: { message: "The workspace owner can't be removed." } }, { status: 400 });
  }
  await convexMutation(api.workspaces.removeMember, { workspace_id: ws.id, user_id: targetUserId });
  if (teamMemberId) {
    await convexMutation(api.teams.removeMember, { id: teamMemberId });
  }
  return Response.json({ ok: true });
}
