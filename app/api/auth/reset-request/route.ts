import { randomBytes } from "node:crypto";
import { findUserByEmail, getSessionUser } from "@/lib/auth";
import { getDb, now } from "@/lib/db";
import { queueEmail } from "@/lib/emails";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  // "self" = signed-in user requesting their own link from Settings
  const user =
    body?.email === "self" ? await getSessionUser() : findUserByEmail(String(body?.email ?? ""));
  if (user) {
    const token = randomBytes(24).toString("hex");
    getDb()
      .prepare("INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)")
      .run(token, user.id, new Date(Date.now() + 3600_000).toISOString());
    const link = `${new URL(req.url).origin}/reset-password?token=${token}`;
    queueEmail(user.id, "password_reset", "Reset your Post Train password", link);
    console.log(`[dev] password reset link for ${user.email}: ${link} (${now()})`);
  }
  // Always 200 — don't leak which emails exist
  return Response.json({ ok: true });
}
