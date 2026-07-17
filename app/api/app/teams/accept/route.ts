import { redirect } from "next/navigation";
import { requireUser, sign } from "@/lib/auth";
import { getDb, now } from "@/lib/db";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (sign(token) !== sig) redirect("/dashboard/teams?error=bad_invite");
  const [teamId, email] = Buffer.from(token, "base64url").toString().split("|");
  if (email !== user.email) redirect("/dashboard/teams?error=wrong_account");

  const db = getDb();
  const team = db
    .prepare("SELECT * FROM teams WHERE id = ?")
    .get(teamId) as { id: string; workspace_id: string } | undefined;
  if (!team) redirect("/dashboard/teams?error=bad_invite");

  db.prepare(
    "UPDATE team_members SET status = 'active', user_id = ? WHERE team_id = ? AND email_invited = ?"
  ).run(user.id, teamId, email);
  // Membership grants access to the team's shared workspace
  db.prepare(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES (?, ?, 'member', ?)
     ON CONFLICT(workspace_id, user_id) DO NOTHING`
  ).run(team.workspace_id, user.id, now());
  redirect("/dashboard/teams?joined=1");
}
