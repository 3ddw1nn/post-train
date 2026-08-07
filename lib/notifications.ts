import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery, uid } from "./db";

export type NotificationRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  dedupe_key: string;
  type: string;
  status: "processing" | "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  href: string | null;
  read_at: string | null;
  toast_shown_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listNotifications(userId: string, workspaceId: string, limit = 30) {
  return await convexQuery<NotificationRow[]>(api.notifications.listForUser, {
    user_id: userId,
    workspace_id: workspaceId,
    limit,
  });
}

export async function upsertNotification(input: Omit<NotificationRow, "id" | "read_at" | "toast_shown_at" | "created_at" | "updated_at">) {
  return await convexMutation<NotificationRow>(api.notifications.upsert, { id: uid(), ...input });
}

export async function markNotificationRead(id: string, userId: string) {
  return await convexMutation<boolean>(api.notifications.markRead, { id, user_id: userId });
}

export async function markNotificationToastsShown(items: { id: string; updated_at: string }[], userId: string) {
  return await convexMutation<boolean>(api.notifications.markToastShown, { items, user_id: userId });
}

export async function dismissNotification(id: string, userId: string) {
  return await convexMutation<boolean>(api.notifications.dismiss, { id, user_id: userId });
}

export async function markAllNotificationsRead(userId: string, workspaceId: string) {
  return await convexMutation<boolean>(api.notifications.markAllRead, { user_id: userId, workspace_id: workspaceId });
}
