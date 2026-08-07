import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { listNotifications } from "@/lib/notifications";
import { NotificationsList } from "./notifications-list";
import type { NotificationItem } from "@/components/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireOnboardedUser();
  const workspace = await currentWorkspace(user);
  // 50 is the Convex query's own ceiling — asking for more silently gets
  // clamped there anyway.
  const rows = await listNotifications(user.id, workspace.id, 50);
  return <NotificationsList initial={rows as NotificationItem[]} />;
}
