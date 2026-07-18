import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace, countAccounts } from "@/lib/accounts";
import { getSubscription } from "@/lib/billing";
import { maxAccounts } from "@/lib/entitlements";
import { ConnectionsPanel } from "./connections-panel";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  const { error } = await searchParams;
  const accounts = await accountsForWorkspace(ws.id);
  const sub = await getSubscription(user.id);
  const cap = maxAccounts(sub);

  return (
    <ConnectionsPanel
      accounts={accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username,
        status: a.status,
        avatar_url: a.avatar_url,
      }))}
      used={await countAccounts(ws.id)}
      cap={Number.isFinite(cap) ? cap : null}
      error={error ?? null}
    />
  );
}
