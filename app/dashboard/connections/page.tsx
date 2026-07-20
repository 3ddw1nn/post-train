import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace, countAccounts } from "@/lib/accounts";
import { getSubscription } from "@/lib/billing";
import { entitled, maxAccounts } from "@/lib/entitlements";
import { DemoConnectionsPanel } from "@/components/dashboard-preview";
import { ConnectionsPanel } from "./connections-panel";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { error } = await searchParams;
  const sub = await getSubscription(user.id);
  const hasAccess = !!user.is_staff || entitled(sub);

  if (!hasAccess) {
    return <DemoConnectionsPanel error={error ?? null} />;
  }

  const ws = await currentWorkspace(user);
  const accounts = await accountsForWorkspace(ws.id);
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
