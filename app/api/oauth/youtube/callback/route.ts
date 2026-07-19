import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { convexMutation } from "@/lib/db";
import { accountsForWorkspace } from "@/lib/accounts";
import {
  exchangeCodeForToken,
  fetchYouTubeChannelInfo,
  unpackOAuthState,
  isYouTubeError,
} from "@/lib/youtube";
import { encryptJson } from "@/lib/secretbox";
import { api } from "@/convex/_generated/api";

const STATE_COOKIE = "pt_yt_oauth";

// Callback for YouTube OAuth 2.0 flow.
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
    return Response.redirect(`${url.origin}${returnTo}?error=youtube_auth_failed`);
  }

  try {
    const tokens = await exchangeCodeForToken(code, url.origin);
    const channel = await fetchYouTubeChannelInfo(tokens.access_token);

    const ws = await currentWorkspace(user);
    if (!flow.reconnect) {
      const accounts = await accountsForWorkspace(ws.id);
      const existing = accounts.find(
        (a) => a.platform === "youtube" && a.platform_account_id === channel.channelId
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
      platform: "youtube",
      username: channel.title,
      display_name: channel.title,
      avatar_url: channel.thumbnail,
      platform_account_id: channel.channelId,
      credentials: encryptJson(tokens),
    });
    return Response.redirect(`${url.origin}${returnTo}`);
  } catch (e) {
    const code2 = isYouTubeError(e) ? e.code : "platform_error";
    return Response.redirect(`${url.origin}${returnTo}?error=youtube_${code2}`);
  }
}
