import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const BOOL_FIELDS = [
  "pref_24h_time",
  "pref_filename_caption",
  "pref_server_video_processing",
  "email_automation",
  "email_failure_alerts",
  "email_post_summary",
] as const;

export async function PATCH(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  for (const f of BOOL_FIELDS) {
    if (f in body) {
      db.prepare(`UPDATE users SET ${f} = ? WHERE id = ?`).run(body[f] ? 1 : 0, user.id);
    }
  }
  if (typeof body.display_name === "string" && body.display_name.trim()) {
    db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(
      body.display_name.trim().slice(0, 80),
      user.id
    );
  }
  if (body.weekly_posting_goal !== undefined) {
    const n = Math.max(0, Math.min(100, Number(body.weekly_posting_goal) || 0));
    db.prepare("UPDATE users SET weekly_posting_goal = ? WHERE id = ?").run(n, user.id);
  }
  return Response.json({ ok: true });
}
