import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { patchRecord } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const current = String(body?.current ?? "");
  const next = String(body?.next ?? "");
  if (user.password_hash && !verifyPassword(current, user.password_hash)) {
    return Response.json(
      { error: { message: "Current password is incorrect." } },
      { status: 400 }
    );
  }
  if (next.length < 8) {
    return Response.json(
      { error: { message: "New password must be at least 8 characters." } },
      { status: 400 }
    );
  }
  await patchRecord("users", user.id, { password_hash: hashPassword(next) });
  return Response.json({ ok: true });
}
