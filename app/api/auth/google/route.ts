import { redirect } from "next/navigation";

// Real Google OAuth when GOOGLE_CLIENT_ID/SECRET are configured; the auth card
// disables the button otherwise.
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) redirect("/signin?error=google_not_configured");
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });
  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
