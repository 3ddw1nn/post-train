import { requireUser, sign } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { queueEmail } from "@/lib/emails";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const teamId = String(body?.team_id ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: { message: "Enter a valid email." } }, { status: 400 });
  }
  const db = getDb();
  const team = db
    .prepare("SELECT * FROM teams WHERE id = ? AND creator_id = ?")
    .get(teamId, user.id) as { id: string; name: string } | undefined;
  if (!team) {
    return Response.json({ error: { message: "Team not found." } }, { status: 404 });
  }
  const existing = db
    .prepare("SELECT 1 FROM team_members WHERE team_id = ? AND email_invited = ?")
    .get(teamId, email);
  if (existing) {
    return Response.json({ error: { message: "Already invited." } }, { status: 409 });
  }
  db.prepare(
    "INSERT INTO team_members (team_id, email_invited, status, created_at) VALUES (?, ?, 'invited', ?)"
  ).run(teamId, email, now());
  const token = Buffer.from(`${teamId}|${email}`).toString("base64url");
  const link = `${new URL(req.url).origin}/api/app/teams/accept?token=${token}&sig=${sign(token)}`;
  queueEmail(user.id, "team_invite", `Invite to team ${team.name}`, link);
  console.log(`[dev] team invite for ${email}: ${link}`);
  return Response.json({ ok: true, invite_link: link });
}
