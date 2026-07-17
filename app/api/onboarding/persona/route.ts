import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const VALID = ["founder", "creator", "agency", "enterprise", "small_business", "personal"];

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const persona = String(body?.persona ?? "");
  if (!VALID.includes(persona)) {
    return Response.json({ error: { message: "Pick one of the options." } }, { status: 400 });
  }
  getDb().prepare("UPDATE users SET persona = ? WHERE id = ?").run(persona, user.id);
  return Response.json({ ok: true });
}
