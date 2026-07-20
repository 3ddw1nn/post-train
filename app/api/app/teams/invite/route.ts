import { requireUser, sign } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/permissions";
import { convexMutation, findRecord } from "@/lib/db";
import { queueEmail } from "@/lib/emails";
import { api } from "@/convex/_generated/api";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const teamId = String(body?.team_id ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: { message: "Enter a valid email." } }, { status: 400 });
  }
  const team = await findRecord<{ id: string; name: string; workspace_id: string }>("teams", { id: teamId });
  if (!team || !(await canManageWorkspace(team.workspace_id, user.id))) {
    return Response.json({ error: { message: "Team not found." } }, { status: 404 });
  }
  const existing = await findRecord("team_members", { team_id: teamId, email_invited: email });
  if (existing) {
    return Response.json({ error: { message: "Already invited." } }, { status: 409 });
  }
  await convexMutation(api.teams.inviteMember, { team_id: teamId, email_invited: email });
  const token = Buffer.from(`${teamId}|${email}`).toString("base64url");
  const link = `${new URL(req.url).origin}/api/app/teams/accept?token=${token}&sig=${sign(token)}`;
  await queueEmail(user.id, "team_invite", `Invite to team ${team.name}`, link);
  console.log(`[dev] team invite for ${email}: ${link}`);
  return Response.json({ ok: true, invite_link: link });
}
