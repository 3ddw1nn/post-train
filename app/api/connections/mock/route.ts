import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { platform as platformOf } from "@/lib/platforms";
import { convexMutation } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { accountsForWorkspace } from "@/lib/accounts";
import { api } from "@/convex/_generated/api";

// Completes the simulated OAuth flow: creates (or refreshes) a social account.
export async function POST(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const p = platformOf(String(body?.platform ?? ""));
  const username = String(body?.username ?? "").replace(/^@/, "").trim();
  if (!p || !username) {
    return Response.json({ error: { message: "Invalid platform or username." } }, { status: 400 });
  }
  if (p.id === "bluesky") {
    // Bluesky has a real integration — never create credential-less rows for it.
    return Response.json(
      { error: { message: "Use the Bluesky sign-in form to connect this platform." } },
      { status: 400 }
    );
  }
  if (body?.reconnect) {
    const id = Number(body.reconnect);
    const row = (await accountsForWorkspace(ws.id)).find((a) => a.id === id);
    if (!row) {
      return Response.json({ error: { message: "Account not found." } }, { status: 404 });
    }
    await convexMutation(api.accounts.patchAccount, { id, patch: { status: "active", username } });
    return Response.json({ ok: true });
  }

  // Plan cap check at connect time (15 / 50 / ∞, small free cap)
  const sub = await getSubscription(user.id);
  const cap = maxAccounts(sub);
  const count = (await accountsForWorkspace(ws.id)).length;
  if (count >= cap) {
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

  await convexMutation(api.accounts.upsertMockAccount, {
    workspace_id: ws.id,
    platform: p.id,
    username,
    display_name: username,
    avatar_url: null,
  });
  return Response.json({ ok: true });
}
