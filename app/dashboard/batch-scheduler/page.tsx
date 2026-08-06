import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { getSubscription } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { slotsForWorkspace } from "@/lib/queue";
import { PaywallCard } from "@/components/paywall-card";
import { BatchScheduler } from "./batch-scheduler";

export const metadata = { title: "Batch Scheduler" };

export default async function BatchSchedulerPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  if (!entitled(sub)) return <PaywallCard />; // batch scheduling is a paid feature
  const ws = await currentWorkspace(user);
  // Queue slots decide whether "fill my queue" is offerable at all — without a
  // configured schedule the server would reject every use_queue post, so the
  // option is disabled up front rather than failing 40 posts in.
  const [accounts, slots] = await Promise.all([
    accountsForWorkspace(ws.id),
    slotsForWorkspace(ws.id),
  ]);
  return (
    <BatchScheduler
      accounts={accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username,
        avatar_url: a.avatar_url,
      }))}
      hasQueue={slots.length > 0}
      prefFilenameCaption={!!user.pref_filename_caption}
    />
  );
}
