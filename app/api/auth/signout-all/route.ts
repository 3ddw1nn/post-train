import { clearSessionCookie, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST() {
  const user = await requireUser();
  // Bumping the epoch invalidates every issued session token
  getDb()
    .prepare("UPDATE users SET session_epoch = session_epoch + 1 WHERE id = ?")
    .run(user.id);
  await clearSessionCookie();
  return Response.json({ ok: true, redirect: "/signin" });
}
