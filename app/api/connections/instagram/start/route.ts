import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { authorizeUrl, newCsrfState, packOAuthState } from "@/lib/instagram";

const STATE_COOKIE = "pt_instagram_oauth";

export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const csrfState = newCsrfState();
  const token = packOAuthState({ state: csrfState, returnTo: url.searchParams.get("return") || "/dashboard/connections", reconnect: url.searchParams.get("reconnect") ? Number(url.searchParams.get("reconnect")) : undefined });
  const jar = await cookies();
  jar.set(STATE_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(authorizeUrl(url.origin, csrfState));
}
