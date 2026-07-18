import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { authorizeUrl, newCsrfState, packOAuthState } from "@/lib/linkedin";

const STATE_COOKIE = "pt_li_oauth";

// Begins the real LinkedIn OAuth 2.0 flow — redirects to LinkedIn's consent screen.
export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("return") || "/dashboard/connections";
  const reconnect = url.searchParams.get("reconnect");

  const csrfState = newCsrfState();
  const token = packOAuthState({
    state: csrfState,
    returnTo,
    reconnect: reconnect ? Number(reconnect) : undefined,
  });

  const jar = await cookies();
  jar.set(STATE_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  return Response.redirect(authorizeUrl(csrfState));
}
