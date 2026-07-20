import { redirect } from "next/navigation";
import { requireUser, sign } from "@/lib/auth";
import { convexMutation, findRecord, insertRecord, listRecords, now } from "@/lib/db";
import { getSubscription } from "@/lib/billing";
import { joinableWorkspaceCap } from "@/lib/entitlements";
import { api } from "@/convex/_generated/api";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (sign(token) !== sig) redirect("/dashboard/settings/workspace?error=bad_invite");
  const [teamId, email] = Buffer.from(token, "base64url").toString().split("|");
  if (email !== user.email) redirect("/dashboard/settings/workspace?error=wrong_account");

  const team = await findRecord<{ id: string; workspace_id: string }>("teams", { id: teamId });
  if (!team) redirect("/dashboard/settings/workspace?error=bad_invite");

  const existing = await findRecord<{ workspace_id: string }>("workspace_members", {
    workspace_id: team.workspace_id,
    user_id: user.id,
  });
  if (!existing) {
    const sub = await getSubscription(user.id);
    const cap = joinableWorkspaceCap(sub);
    const memberships = await listRecords<{ workspace_id: string }>("workspace_members", { user_id: user.id });
    const owned = await listRecords<{ id: string }>("workspaces", { owner_id: user.id });
    const ownedIds = new Set(owned.map((w) => w.id));
    const joinedElsewhere = memberships.filter((m) => !ownedIds.has(m.workspace_id)).length;
    if (!user.is_staff && joinedElsewhere >= cap) {
      redirect("/dashboard/settings/workspace?error=join_cap");
    }
  }

  await convexMutation(api.teams.acceptInvite, { team_id: teamId, user_id: user.id, email });
  if (!existing) {
    await insertRecord("workspace_members", {
      workspace_id: team.workspace_id,
      user_id: user.id,
      role: "member",
      created_at: now(),
    });
  }
  redirect("/dashboard/settings/workspace?joined=1");
}
