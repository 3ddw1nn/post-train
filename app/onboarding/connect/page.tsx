import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { CONNECT_ERRORS } from "@/lib/platforms";
import { Icon } from "@/components/icons";
import { ConnectedAccountCard } from "@/components/connected-account-card";
import { FooterBar } from "../footer-bar";

export const metadata = { title: "Connect your accounts" };

export default async function OnboardingConnect({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const accounts = await accountsForWorkspace(ws.id);
  const { error } = await searchParams;

  return (
    <div className="fade-up mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Connect your accounts</h1>
      <p className="mt-1 text-sm text-muted">
        Link the social accounts you post to. You can always add more later.
      </p>
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {CONNECT_ERRORS[error] ?? "Something went wrong connecting that account — try again."}
        </p>
      )}
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
            {accounts.length > 0 ? "Next" : "Skip for now"}
          </Link>
        }
      />
    </div>
  );
}
