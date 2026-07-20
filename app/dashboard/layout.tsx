import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { planLabel, planOf, entitled } from "@/lib/entitlements";
import { currentWorkspace, workspacesForUser } from "@/lib/workspaces";
import { Sidebar } from "@/components/sidebar";
import { PromoBanner } from "@/components/promo-banner";
import { ChatLauncher } from "@/components/interactive";
import { DashboardPaywall } from "@/components/dashboard-paywall";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Hard gate: every /dashboard/* route redirects un-onboarded users to the wizard
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const workspaces = await workspacesForUser(user.id);
  const ws = await currentWorkspace(user);

  const upsellUntil = user.first_subscribed_at
    ? new Date(new Date(user.first_subscribed_at).getTime() + 24 * 3600_000)
    : null;
  const showUpsell =
    !!upsellUntil &&
    upsellUntil > new Date() &&
    !user.upsell_dismissed &&
    planOf(sub) !== "pro";

  return (
    <div className="min-h-screen bg-page">
      <Sidebar
        displayName={user.display_name || user.email}
        planLabel={planLabel(sub)}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
        currentWorkspaceId={ws.id}
        isStaff={!!user.is_staff}
        showDevMode={process.env.NODE_ENV !== "production"}
      />
      <div className="pt-14 lg:pl-[var(--pt-sidebar-width,232px)]">
        {showUpsell && <PromoBanner until={upsellUntil!.toISOString()} />}
        <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
      </div>
      <ChatLauncher variant="app" />
      <DashboardPaywall show={!user.is_staff && !entitled(sub)} />
    </div>
  );
}
