import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { canManageWorkspace } from "@/lib/permissions";
import { convexMutation } from "@/lib/db";
import { api } from "@/convex/_generated/api";

/** PATCH current-workspace settings. */
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
  if ("auto_cleanup_storage" in body) {
    patch.auto_cleanup_storage = body.auto_cleanup_storage ? 1 : 0;
  }
  if ("webhook_url" in body) {
    const url = String(body.webhook_url ?? "").trim();
    if (url && !/^https?:\/\/.+/.test(url)) {
      return Response.json({ error: { message: "Enter a valid URL." } }, { status: 400 });
    }
    patch.webhook_url = url || null;
  }
  if (Object.keys(patch).length) await convexMutation(api.workspaces.patchWorkspace, { id: ws.id, patch });
  return Response.json({ ok: true });
}
