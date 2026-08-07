import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { currentWorkspace } from "@/lib/workspaces";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationToastsShown,
  upsertNotification,
} from "@/lib/notifications";

export async function GET() {
  try {
    const user = await requireUser();
    const workspace = await currentWorkspace(user);
    return Response.json({ data: await listNotifications(user.id, workspace.id) });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Records a notification for work the client finished on its own.
 *
 * Deliberately narrow: only the batch-scheduler summary, and the caller can't
 * choose its own title/body. Everything else is written server-side where the
 * event actually happens — an endpoint that let the browser post arbitrary
 * notification text would just be a self-spam button.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const workspace = await currentWorkspace(user);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.event !== "batch_scheduled") {
      return Response.json({ error: { message: "Unsupported event." } }, { status: 400 });
    }
    const scheduled = Math.max(0, Math.min(500, Number(body.scheduled) || 0));
    const failed = Math.max(0, Math.min(500, Number(body.failed) || 0));
    if (scheduled + failed === 0) return Response.json({ ok: true });

    await upsertNotification({
      user_id: user.id,
      workspace_id: workspace.id,
      // One entry per run, not per batch-scheduler page visit.
      dedupe_key: `batch:${Date.now()}`,
      type: "batch_schedule",
      status: failed > 0 ? "warning" : "success",
      title: failed > 0 ? "Batch finished with errors" : "Batch scheduled",
      message:
        failed > 0
          ? `${scheduled} post${scheduled === 1 ? "" : "s"} scheduled, ${failed} failed. Open the Batch Scheduler to retry.`
          : `${scheduled} post${scheduled === 1 ? "" : "s"} are queued and will publish on schedule.`,
      href: failed > 0 ? "/dashboard/batch-scheduler" : "/dashboard/posts?status=scheduled",
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const workspace = await currentWorkspace(user);
    const body = await request.json().catch(() => ({}));
    if (body.action === "mark_all_read") {
      await markAllNotificationsRead(user.id, workspace.id);
    } else if (body.action === "mark_toasts_shown" && Array.isArray(body.items)) {
      await markNotificationToastsShown(
        body.items.map((item: unknown) => {
          const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return { id: String(value.id ?? ""), updated_at: String(value.updated_at ?? "") };
        }).filter((item: { id: string; updated_at: string }) => item.id && item.updated_at),
        user.id,
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
