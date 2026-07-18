import { findUserByEmail, requireUser } from "@/lib/auth";
import { patchRecord } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: { message: "Enter a valid email address." } }, { status: 400 });
  }
  const existing = await findUserByEmail(email);
  if (existing && existing.id !== user.id) {
    return Response.json(
      { error: { message: "That email is already in use." } },
      { status: 409 }
    );
  }
  await patchRecord("users", user.id, { email: email.toLowerCase() });
  return Response.json({ ok: true });
}
