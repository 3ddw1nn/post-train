import { requireUser } from "@/lib/auth";
import { createWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { ownedWorkspaceCap } from "@/lib/entitlements";
import { listRecords } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return Response.json({ error: { message: "Workspace name is required." } }, { status: 400 });
  }

  const sub = await getSubscription(user.id);
  const cap = ownedWorkspaceCap(sub);
  const owned = await listRecords("workspaces", { owner_id: user.id });
  if (!user.is_staff && owned.length >= cap) {
    return Response.json(
      {
        error: {
          message: `Your plan allows ${cap} workspace${cap === 1 ? "" : "s"} — upgrade to create another.`,
        },
      },
      { status: 403 }
    );
  }

  const ws = await createWorkspace(user.id, name.slice(0, 60));
  return Response.json({ ok: true, id: ws.id });
}
