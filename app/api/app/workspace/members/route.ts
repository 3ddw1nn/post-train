import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { canManageWorkspace, isWorkspaceOwner, memberRole } from "@/lib/permissions";
import { convexMutation } from "@/lib/db";
import { api } from "@/convex/_generated/api";

const FORBIDDEN = Response.json(
  { error: { message: "Only workspace owners and admins can manage members." } },
  { status: 403 }
);

/** Change a member's role (owner/admin only; the workspace owner's role can't be changed here — use transfer-ownership). */
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
    return Response.json({ error: { message: "The workspace owner's role can't be changed here — transfer ownership instead." } }, { status: 400 });
  }
  await convexMutation(api.workspaces.changeRole, { workspace_id: ws.id, user_id: targetUserId, role });
  return Response.json({ ok: true });
}

/**
 * Remove a member. Owners can remove admins or members. Admins can remove
 * members only — not other admins, and never the owner.
 */
export async function DELETE(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) return FORBIDDEN;

  const body = await req.json().catch(() => null);
  const targetUserId = String(body?.user_id ?? "");
  const teamMemberId = Number(body?.team_member_id);

  const actorRole = await memberRole(ws.id, user.id);
  const targetRole = await memberRole(ws.id, targetUserId);
  if (targetRole === "owner") {
    return Response.json({ error: { message: "The workspace owner can't be removed." } }, { status: 400 });
  }
  if (actorRole === "admin" && targetRole !== "member") {
    return Response.json({ error: { message: "Admins can only remove members, not other admins." } }, { status: 403 });
  }

  await convexMutation(api.workspaces.removeMember, { workspace_id: ws.id, user_id: targetUserId });
  if (teamMemberId) {
    await convexMutation(api.teams.removeMember, { id: teamMemberId });
  }
  return Response.json({ ok: true });
}
