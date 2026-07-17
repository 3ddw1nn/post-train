import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST() {
  const user = await requireUser();
  getDb().prepare("UPDATE users SET upsell_dismissed = 1 WHERE id = ?").run(user.id);
  return Response.json({ ok: true });
}
