import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { getSubscription } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { platform as platformOf } from "@/lib/platforms";
import { PaywallCard } from "@/components/paywall-card";
import { BulkUploader } from "../bulk-uploader";

export const metadata = { title: "Bulk Video Scheduling" };

export default async function BulkVideosPage() {
  const user = await requireOnboardedUser();
  const sub = getSubscription(user.id);
  if (!entitled(sub)) return <PaywallCard />; // bulk scheduling is a paid feature
  const ws = await currentWorkspace(user);
  const accounts = accountsForWorkspace(ws.id).filter((a) =>
    platformOf(a.platform)?.supports.includes("video")
  );
  return (
    <BulkUploader
      kind="video"
      accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username }))}
      prefFilenameCaption={!!user.pref_filename_caption}
    />
  );
}
