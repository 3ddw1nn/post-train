import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getDb } from "@/lib/db";

/** PATCH current-workspace settings (randomize queue, webhook URL). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  if ("randomize_queue_time" in body) {
    db.prepare("UPDATE workspaces SET randomize_queue_time = ? WHERE id = ?").run(
      body.randomize_queue_time ? 1 : 0,
      ws.id
    );
  }
  if ("webhook_url" in body) {
    const url = String(body.webhook_url ?? "").trim();
    if (url && !/^https?:\/\/.+/.test(url)) {
      return Response.json({ error: { message: "Enter a valid URL." } }, { status: 400 });
    }
    db.prepare("UPDATE workspaces SET webhook_url = ? WHERE id = ?").run(url || null, ws.id);
  }
  return Response.json({ ok: true });
}
