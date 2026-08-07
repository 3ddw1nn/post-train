import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { dismissNotification, markNotificationRead } from "@/lib/notifications";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await markNotificationRead(id, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await dismissNotification(id, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
