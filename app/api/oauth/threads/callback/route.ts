import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { accountsForWorkspace } from "@/lib/accounts";
import { convexMutation } from "@/lib/db";
import { encryptJson } from "@/lib/secretbox";
import { exchangeCodeForToken, fetchThreadsProfile, isThreadsError, unpackOAuthState } from "@/lib/threads";
import { api } from "@/convex/_generated/api";

const STATE_COOKIE = "pt_threads_oauth";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const jar = await cookies();
  const flow = unpackOAuthState(jar.get(STATE_COOKIE)?.value);
  jar.delete(STATE_COOKIE);
  const returnTo = flow?.returnTo || "/dashboard/connections";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code || !flow || flow.state !== url.searchParams.get("state")) return Response.redirect(`${url.origin}${returnTo}?error=threads_auth_failed`);
  try {
    const creds = await exchangeCodeForToken(code, url.origin);
    const profile = await fetchThreadsProfile(creds);
    const ws = await currentWorkspace(user);
    if (!flow.reconnect) {
      const accounts = await accountsForWorkspace(ws.id);
      if (!accounts.some((account) => account.platform === "threads" && account.platform_account_id === profile.id) && accounts.length >= maxAccounts(await getSubscription(user.id))) return Response.redirect(`${url.origin}${returnTo}?error=plan_limit`);
    }
    await convexMutation(api.accounts.upsertMockAccount, { workspace_id: ws.id, platform: "threads", username: profile.username, display_name: profile.displayName, avatar_url: profile.avatarUrl, platform_account_id: profile.id, credentials: encryptJson(creds) });
    return Response.redirect(`${url.origin}${returnTo}`);
  } catch (error) {
    console.error("[threads oauth callback]", error);
    return Response.redirect(`${url.origin}${returnTo}?error=threads_${isThreadsError(error) ? error.code : "platform_error"}`);
  }
}
