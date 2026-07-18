import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { convexMutation } from "@/lib/db";
import { accountsForWorkspace } from "@/lib/accounts";
import { exchangeCodeForToken, fetchTwitterProfile, unpackOAuthState, isTwitterError } from "@/lib/twitter";
import { encryptJson } from "@/lib/secretbox";
import { api } from "@/convex/_generated/api";

const STATE_COOKIE = "pt_tw_oauth";

// Callback leg of the real Twitter/X OAuth 2.0 (PKCE) flow.
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const jar = await cookies();
  const flow = unpackOAuthState(jar.get(STATE_COOKIE)?.value);
  jar.delete(STATE_COOKIE);

  const returnTo = flow?.returnTo || "/dashboard/connections";
  if (error || !code || !flow || flow.state !== returnedState) {
    return Response.redirect(`${url.origin}${returnTo}?error=twitter_auth_failed`);
  }

  try {
    const tokens = await exchangeCodeForToken(code, flow.verifier);
    const profile = await fetchTwitterProfile(tokens.access_token);

    const ws = await currentWorkspace(user);
    if (!flow.reconnect) {
      const accounts = await accountsForWorkspace(ws.id);
      const existing = accounts.find((a) => a.platform === "twitter" && a.username === profile.username);
      if (!existing) {
        const cap = maxAccounts(await getSubscription(user.id));
        if (accounts.length >= cap) {
          return Response.redirect(`${url.origin}${returnTo}?error=plan_limit`);
        }
      }
    }

    await convexMutation(api.accounts.upsertMockAccount, {
      workspace_id: ws.id,
      platform: "twitter",
      username: profile.username,
      display_name: profile.name,
      avatar_url: profile.profile_image_url,
      platform_account_id: profile.id,
      credentials: encryptJson(tokens),
    });
    return Response.redirect(`${url.origin}${returnTo}`);
  } catch (e) {
    const code2 = isTwitterError(e) ? e.code : "platform_error";
    return Response.redirect(`${url.origin}${returnTo}?error=twitter_${code2}`);
  }
}
