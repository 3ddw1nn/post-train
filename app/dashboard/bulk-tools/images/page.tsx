import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { getSubscription } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { platform as platformOf } from "@/lib/platforms";
import { PaywallCard } from "@/components/paywall-card";
import { BulkUploader } from "../bulk-uploader";

export const metadata = { title: "Bulk Image Scheduling" };

export default async function BulkImagesPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  if (!entitled(sub)) return <PaywallCard />;
  const ws = await currentWorkspace(user);
  const accounts = (await accountsForWorkspace(ws.id)).filter((a) =>
    platformOf(a.platform)?.supports.includes("image")
  );
  return (
    <BulkUploader
      kind="image"
      accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, avatar_url: a.avatar_url }))}
      prefFilenameCaption={!!user.pref_filename_caption}
    />
  );
}
