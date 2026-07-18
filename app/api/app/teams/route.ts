import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { teamsCreate } from "@/lib/entitlements";
import { canManageWorkspace } from "@/lib/permissions";
import { convexMutation, uid } from "@/lib/db";
import { api } from "@/convex/_generated/api";

export async function POST(req: Request) {
  const user = await requireUser();
  const sub = await getSubscription(user.id);
  if (!teamsCreate(sub)) {
    return Response.json(
      { error: { message: "Creating teams requires a Growth or Pro subscription." } },
      { status: 403 }
    );
  }
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) {
    return Response.json(
      { error: { message: "Only workspace owners and admins can create teams." } },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return Response.json({ error: { message: "Team name is required." } }, { status: 400 });
  }
  await convexMutation(api.teams.createTeam, {
    id: uid(),
    name: name.slice(0, 60),
    creator_id: user.id,
    workspace_id: ws.id,
  });
  return Response.json({ ok: true });
}
