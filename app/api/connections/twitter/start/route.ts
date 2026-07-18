import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { generatePkce, authorizeUrl, packOAuthState } from "@/lib/twitter";

const STATE_COOKIE = "pt_tw_oauth";

// Begins the real Twitter/X OAuth 2.0 (PKCE) flow — redirects to X's consent screen.
export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("return") || "/dashboard/connections";
  const reconnect = url.searchParams.get("reconnect");

  const { verifier, challenge } = generatePkce();
  const csrfState = randomBytes(16).toString("hex");
  const token = packOAuthState({
    verifier,
    state: csrfState,
    returnTo,
    reconnect: reconnect ? Number(reconnect) : undefined,
  });

  const jar = await cookies();
  jar.set(STATE_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  return Response.redirect(authorizeUrl({ state: csrfState, codeChallenge: challenge }));
}
