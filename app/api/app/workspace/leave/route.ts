import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { memberRole } from "@/lib/permissions";
import { convexMutation, findRecord } from "@/lib/db";
import { api } from "@/convex/_generated/api";

/** A member or admin can remove themselves. The owner must transfer ownership first. */
export async function POST() {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const role = await memberRole(ws.id, user.id);
  if (!role) {
    return Response.json({ error: { message: "You're not a member of this workspace." } }, { status: 400 });
  }
  if (role === "owner") {
    return Response.json(
      { error: { message: "Transfer ownership to another admin before leaving." } },
      { status: 400 }
    );
  }

  await convexMutation(api.workspaces.removeMember, { workspace_id: ws.id, user_id: user.id });
  const team = await findRecord<{ id: string }>("teams", { workspace_id: ws.id });
  if (team) {
    const membership = await findRecord<{ id: number }>("team_members", { team_id: team.id, user_id: user.id });
    if (membership) await convexMutation(api.teams.removeMember, { id: membership.id });
  }
  return Response.json({ ok: true });
}
