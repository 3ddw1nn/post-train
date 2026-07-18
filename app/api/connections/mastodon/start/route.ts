import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { normalizeInstance, registerApp, authorizeUrl, packFlowState } from "@/lib/mastodon";

const STATE_COOKIE = "pt_mstdn_oauth";

// Begins the real Mastodon OAuth flow. No developer console needed — we
// register a fresh app with the user's instance right here, in real time.
// Returns JSON (not a redirect) so the connect form can show a bad-server
// error inline instead of bouncing the user to a different page.
export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("return") || "/dashboard/connections";
  const reconnect = url.searchParams.get("reconnect");
  const instanceInput = url.searchParams.get("instance");
  if (!instanceInput) {
    return Response.json({ error: { message: "Enter your Mastodon server first." } }, { status: 400 });
  }
  const instance = normalizeInstance(instanceInput);
  const redirectUri = `${url.origin}/api/oauth/mastodon/callback`;

  let app;
  try {
    app = await registerApp(instance, redirectUri);
  } catch {
    return Response.json(
      { error: { message: `Couldn't reach "${instance}" — check the server name and try again.` } },
      { status: 502 }
    );
  }

  const csrfState = randomBytes(16).toString("hex");
  const token = packFlowState({
    instance,
    clientId: app.client_id,
    clientSecret: app.client_secret,
    state: csrfState,
    returnTo,
    reconnect: reconnect ? Number(reconnect) : undefined,
  });

  const jar = await cookies();
  jar.set(STATE_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  return Response.json({ ok: true, authorize_url: authorizeUrl(instance, app, redirectUri, csrfState) });
}
