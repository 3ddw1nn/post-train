import { hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  const password = String(body?.password ?? "");
  if (password.length < 8) {
    return Response.json(
      { error: { message: "Password must be at least 8 characters." } },
      { status: 400 }
    );
  }
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM password_resets WHERE token = ?")
    .get(token) as { user_id: string; expires_at: string } | undefined;
  if (!row || new Date(row.expires_at) < new Date()) {
    return Response.json(
      { error: { message: "This reset link is invalid or expired." } },
      { status: 400 }
    );
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(password),
    row.user_id
  );
  db.prepare("DELETE FROM password_resets WHERE token = ?").run(token);
  return Response.json({ ok: true });
}
