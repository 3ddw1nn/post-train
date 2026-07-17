import { findUserByEmail, setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user = findUserByEmail(String(body?.email ?? ""));
  if (!user || !verifyPassword(String(body?.password ?? ""), user.password_hash)) {
    return Response.json(
      { error: { message: "Incorrect email or password." } },
      { status: 401 }
    );
  }
  await setSessionCookie(user.id, user.session_epoch);
  return Response.json({
    ok: true,
    redirect: user.onboarded_at ? "/dashboard/create" : "/onboarding/start",
  });
}
