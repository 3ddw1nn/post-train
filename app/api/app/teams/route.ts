import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { teamsCreate } from "@/lib/entitlements";
import { getDb, now, uid } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const sub = getSubscription(user.id);
  if (!teamsCreate(sub)) {
    return Response.json(
      { error: { message: "Creating teams requires a Growth or Pro subscription." } },
      { status: 403 }
    );
  }
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return Response.json({ error: { message: "Team name is required." } }, { status: 400 });
  }
  getDb()
    .prepare(
      "INSERT INTO teams (id, name, creator_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(uid(), name.slice(0, 60), user.id, ws.id, now());
  return Response.json({ ok: true });
}
