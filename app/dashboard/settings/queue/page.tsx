import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { slotsForWorkspace } from "@/lib/queue";
import { QueueEditor } from "./queue-editor";

export const metadata = { title: "Queue" };

export default async function QueueSettingsPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  const slots = slotsForWorkspace(ws.id);

  return (
    <QueueEditor
      slots={slots.map((s) => ({ id: s.id, time: s.time_local, days: s.days }))}
      timezone={user.timezone || "UTC"}
      pref24h={!!user.pref_24h_time}
      randomize={!!ws.randomize_queue_time}
    />
  );
}
