import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { Icon } from "@/components/icons";
import { ConnectedAccountCard } from "@/components/connected-account-card";
import { FooterBar } from "../footer-bar";

export const metadata = { title: "Connect your accounts" };

export default async function OnboardingConnect() {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const accounts = accountsForWorkspace(ws.id);

  return (
    <div className="fade-up mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Connect your accounts</h1>
      <p className="mt-1 text-sm text-muted">
        Link the social accounts you post to. You can always add more later.
      </p>
      <Link
        href="/onboarding/connect/add"
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white/60 px-5 py-6 font-semibold text-muted transition-colors hover:border-primary hover:text-primary-deep"
      >
        <Icon name="plus" size={18} /> Add connection
      </Link>
      <div className="mt-4 flex flex-col gap-3">
        {accounts.map((a) => (
          <ConnectedAccountCard key={a.id} account={a} returnTo="/onboarding/connect" />
        ))}
      </div>
      <FooterBar
        backHref="/onboarding/start"
        next={
          <Link href="/onboarding/plans" className="btn-primary px-8">
            Next
          </Link>
        }
      />
    </div>
  );
}
