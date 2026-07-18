import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { canManageWorkspace } from "@/lib/permissions";
import { patchRecord } from "@/lib/db";

/** PATCH current-workspace settings (randomize queue, webhook URL). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) {
    return Response.json(
      { error: { message: "Only workspace owners and admins can change workspace settings." } },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if ("randomize_queue_time" in body) {
    patch.randomize_queue_time = body.randomize_queue_time ? 1 : 0;
  }
  if ("webhook_url" in body) {
    const url = String(body.webhook_url ?? "").trim();
    if (url && !/^https?:\/\/.+/.test(url)) {
      return Response.json({ error: { message: "Enter a valid URL." } }, { status: 400 });
    }
    patch.webhook_url = url || null;
  }
  if (Object.keys(patch).length) await patchRecord("workspaces", ws.id, patch);
  return Response.json({ ok: true });
}
