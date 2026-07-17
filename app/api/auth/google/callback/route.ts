import { redirect } from "next/navigation";
import { createUser, findUserByEmail, setSessionCookie } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) redirect("/signin?error=google_failed");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) redirect("/signin?error=google_failed");
  const tokens = (await tokenRes.json()) as { access_token: string };
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) redirect("/signin?error=google_failed");
  const profile = (await profileRes.json()) as {
    email: string;
    name?: string;
    picture?: string;
  };

  let user = findUserByEmail(profile.email);
  if (!user) {
    user = createUser({
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.picture,
    });
  }
  await setSessionCookie(user.id, user.session_epoch);
  redirect(user.onboarded_at ? "/dashboard/create" : "/onboarding/start");
}
