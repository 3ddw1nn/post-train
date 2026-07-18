import { hashPassword } from "@/lib/auth";
import { convexMutation, convexQuery, patchRecord } from "@/lib/db";
import { api } from "@/convex/_generated/api";

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
  const row = await convexQuery<{ user_id: string; expires_at: string } | null>(
    api.auth.getPasswordReset,
    { token }
  );
  if (!row || new Date(row.expires_at) < new Date()) {
    return Response.json(
      { error: { message: "This reset link is invalid or expired." } },
      { status: 400 }
    );
  }
  await patchRecord("users", row.user_id, { password_hash: hashPassword(password) });
  await convexMutation(api.auth.deletePasswordReset, { token });
  return Response.json({ ok: true });
}
