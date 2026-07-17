import { createUser, findUserByEmail, setSessionCookie } from "@/lib/auth";
import { isValidTimezone } from "@/lib/tz";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: { message: "Enter a valid email address." } }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json(
      { error: { message: "Password must be at least 8 characters." } },
      { status: 400 }
    );
  }
  if (findUserByEmail(email)) {
    return Response.json(
      { error: { message: "An account with this email already exists." } },
      { status: 409 }
    );
  }
  const tz = typeof body?.timezone === "string" && isValidTimezone(body.timezone) ? body.timezone : "UTC";
  const user = createUser({
    email,
    password,
    displayName: body?.display_name ? String(body.display_name) : undefined,
    timezone: tz,
  });
  await setSessionCookie(user.id, user.session_epoch);
  return Response.json({ ok: true, redirect: "/onboarding/start" });
}
