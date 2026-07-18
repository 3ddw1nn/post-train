import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { convexMutation } from "@/lib/db";
import { accountsForWorkspace } from "@/lib/accounts";
import { blueskyLogin, blueskyProfile, isBlueskyError } from "@/lib/bluesky";
import { encryptJson } from "@/lib/secretbox";
import { api } from "@/convex/_generated/api";

// Real Bluesky connection: verifies the app password against bsky.social,
// then stores it encrypted for the publish worker.
export async function POST(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const identifier = String(body?.identifier ?? "").replace(/^@/, "").trim();
  const appPassword = String(body?.app_password ?? "").trim();
  if (!identifier || !appPassword) {
    return Response.json(
      { error: { message: "Enter your Bluesky handle and an app password." } },
      { status: 400 }
    );
  }

  let session;
  try {
    session = await blueskyLogin({ identifier, appPassword });
  } catch (e) {
    const message = isBlueskyError(e) ? e.message : "Could not reach Bluesky — try again.";
    return Response.json({ error: { message } }, { status: 401 });
  }
  const profile = await blueskyProfile(session).catch(() => ({ displayName: null, avatar: null }));

  // Plan cap only applies to genuinely new connections, not re-authorizations.
  const accounts = await accountsForWorkspace(ws.id);
  const existing = accounts.find((a) => a.platform === "bluesky" && a.username === session.handle);
  if (!existing) {
    const cap = maxAccounts(await getSubscription(user.id));
    if (accounts.length >= cap) {
      return Response.json(
        {
          error: {
            message: `Your plan allows ${cap} connected account${cap === 1 ? "" : "s"}. Upgrade to connect more.`,
            code: "plan_limit",
          },
        },
        { status: 403 }
      );
    }
  }

  await convexMutation(api.accounts.upsertMockAccount, {
    workspace_id: ws.id,
    platform: "bluesky",
    username: session.handle,
    display_name: profile.displayName ?? session.handle,
    avatar_url: profile.avatar,
    platform_account_id: session.did,
    credentials: encryptJson({ identifier, appPassword }),
  });
  return Response.json({ ok: true });
}
