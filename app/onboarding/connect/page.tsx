import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { CONNECT_ERRORS } from "@/lib/platforms";
import { Icon } from "@/components/icons";
import { ConnectedAccountCard } from "@/components/connected-account-card";

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
      <Link
        href="/onboarding/tour/queue"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <Icon name="chevronLeft" size={15} /> Back
      </Link>
      <h1 className="text-2xl font-bold">Connect your accounts</h1>
      <p className="mt-1 text-sm text-muted">
        Link the social accounts you post to. You can always add more later.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          Green means connected
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Yellow means reconnect
        </span>
      </div>
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
      <div className="mt-6 flex justify-end">
        <Link href="/onboarding/done" className="btn-primary px-11 py-[18px] text-xl">
          {accounts.length > 0 ? "Continue" : "Skip for now"}
        </Link>
      </div>
    </div>
  );
}
