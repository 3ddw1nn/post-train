import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { convexMutation } from "@/lib/db";
import { accountsForWorkspace } from "@/lib/accounts";
import { exchangeCodeForToken, fetchMastodonProfile, unpackFlowState, isMastodonError } from "@/lib/mastodon";
import { encryptJson } from "@/lib/secretbox";
import { api } from "@/convex/_generated/api";

const STATE_COOKIE = "pt_mstdn_oauth";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const jar = await cookies();
  const flow = unpackFlowState(jar.get(STATE_COOKIE)?.value);
  jar.delete(STATE_COOKIE);

  const returnTo = flow?.returnTo || "/dashboard/connections";
  if (error || !code || !flow || flow.state !== returnedState) {
    return Response.redirect(`${url.origin}${returnTo}?error=mastodon_auth_failed`);
  }

  try {
    const redirectUri = `${url.origin}/api/oauth/mastodon/callback`;
    const app = { client_id: flow.clientId, client_secret: flow.clientSecret };
    const accessToken = await exchangeCodeForToken(flow.instance, app, code, redirectUri);
    const profile = await fetchMastodonProfile(flow.instance, accessToken);

    const ws = await currentWorkspace(user);
    if (!flow.reconnect) {
      const accounts = await accountsForWorkspace(ws.id);
      const existing = accounts.find(
        (a) => a.platform === "mastodon" && a.username === `${profile.username}@${flow.instance}`
      );
      if (!existing) {
        const cap = maxAccounts(await getSubscription(user.id));
        if (accounts.length >= cap) {
          return Response.redirect(`${url.origin}${returnTo}?error=plan_limit`);
        }
      }
    }

    await convexMutation(api.accounts.upsertMockAccount, {
      workspace_id: ws.id,
      platform: "mastodon",
      username: `${profile.username}@${flow.instance}`,
      display_name: profile.display_name,
      avatar_url: profile.avatar,
      platform_account_id: profile.id,
      credentials: encryptJson({ instance: flow.instance, access_token: accessToken }),
    });
    return Response.redirect(`${url.origin}${returnTo}`);
  } catch (e) {
    const code2 = isMastodonError(e) ? e.code : "platform_error";
    return Response.redirect(`${url.origin}${returnTo}?error=mastodon_${code2}`);
  }
}
