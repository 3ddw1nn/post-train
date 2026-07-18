import { redirect } from "next/navigation";
import { requireUser, sign } from "@/lib/auth";
import { convexMutation, findRecord, insertRecord, now } from "@/lib/db";
import { api } from "@/convex/_generated/api";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (sign(token) !== sig) redirect("/dashboard/teams?error=bad_invite");
  const [teamId, email] = Buffer.from(token, "base64url").toString().split("|");
  if (email !== user.email) redirect("/dashboard/teams?error=wrong_account");

  const team = await findRecord<{ id: string; workspace_id: string }>("teams", { id: teamId });
  if (!team) redirect("/dashboard/teams?error=bad_invite");

  await convexMutation(api.teams.acceptInvite, { team_id: teamId, user_id: user.id, email });
  // Membership grants access to the team's shared workspace
  const existing = await findRecord("workspace_members", { workspace_id: team.workspace_id, user_id: user.id });
  if (!existing) {
    await insertRecord("workspace_members", {
      workspace_id: team.workspace_id,
      user_id: user.id,
      role: "member",
      created_at: now(),
    });
  }
  redirect("/dashboard/teams?joined=1");
}
