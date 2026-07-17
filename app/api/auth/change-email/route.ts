import { findUserByEmail, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: { message: "Enter a valid email address." } }, { status: 400 });
  }
  const existing = findUserByEmail(email);
  if (existing && existing.id !== user.id) {
    return Response.json(
      { error: { message: "That email is already in use." } },
      { status: 409 }
    );
  }
  getDb().prepare("UPDATE users SET email = ? WHERE id = ?").run(email.toLowerCase(), user.id);
  return Response.json({ ok: true });
}
