import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { currentWorkspace } from "@/lib/workspaces";
import { countAccounts } from "@/lib/accounts";
import { getWorkspaceStorageStatus } from "@/lib/media";
import {
  entitled,
  apiAccess,
  apiRateLimit,
  maxAccounts,
  studioAiMonthlyCredits,
  monthStartIso,
} from "@/lib/entitlements";
import { formatBytes } from "@/lib/format";
import { Icon } from "@/components/icons";
import { CreditAllowanceMeter } from "@/components/buy-credits";
import { convexQuery } from "@/lib/db";
import { api } from "@/convex/_generated/api";

export const metadata = { title: "Usage" };

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-page/50 px-5 py-3">
      <Icon name={icon} size={14} className="text-muted" />
      <h2 className="text-sm font-bold">{title}</h2>
    </div>
  );
}

export default async function UsagePage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const live = entitled(sub);
  const ws = await currentWorkspace(user);

  const [storage, accountsUsed] = await Promise.all([
    getWorkspaceStorageStatus(ws.id),
    countAccounts(ws.id),
  ]);
  const accountCap = maxAccounts(sub);

  // Account-scoped, matching how the allowance is enforced: one pool shared
  // across every workspace this user owns — same as the Billing page.
  const aiAllowance = studioAiMonthlyCredits(sub);
  const credits = live
    ? await convexQuery<{ allowance_used: number; purchased: number }>(api.credits.balanceForOwner, {
        owner_id: user.id,
        allowance: aiAllowance,
        since: monthStartIso(),
      })
    : { allowance_used: 0, purchased: 0 };

  return (
    <div className="flex flex-col gap-4">
      <section className="card overflow-hidden">
        <SectionHeader icon="sparkles" title="AI video credits" />
        <div className="p-5">
          <p className="text-sm text-muted">
            Used by the AI UGC Video Studio. 1 credit renders 5 seconds of video.
          </p>
          {live ? (
            <>
              <div className="mt-4 max-w-sm">
                <CreditAllowanceMeter used={credits.allowance_used} cap={aiAllowance} purchased={credits.purchased} />
              </div>
              <Link href="/dashboard/settings/billing" className="btn-subtle mt-4">
                Manage &amp; buy more <Icon name="chevronRight" size={13} />
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Requires a paid plan.{" "}
              <Link href="/dashboard/settings/plans" className="font-semibold text-primary-deep hover:underline">
                View plans
              </Link>
            </p>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <SectionHeader icon="key" title="API & MCP" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-muted">
            {apiAccess(sub)
              ? `${apiRateLimit(sub).toLocaleString()} requests/min · included with your plan`
              : "Included with every paid plan"}
          </p>
          <Link href="/dashboard/api-keys" className="btn-subtle">
            Manage keys
          </Link>
        </div>
      </section>

      <section className="card overflow-hidden">
        <SectionHeader icon="stack" title="Workspace storage" />
        <div className="p-5">
          <p className="text-sm font-semibold">
            {formatBytes(storage.usedBytes)} <span className="font-medium text-muted">of {formatBytes(storage.limitBytes)} used</span>
          </p>
          <div
            className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-page"
            role="progressbar"
            aria-label="Workspace storage used"
            aria-valuemin={0}
            aria-valuemax={storage.limitBytes}
            aria-valuenow={Math.min(storage.usedBytes, storage.limitBytes)}
          >
            <div
              className={`h-full rounded-full ${storage.isFull ? "bg-danger" : "bg-primary"}`}
              style={{ width: `${Math.min(100, (storage.usedBytes / storage.limitBytes) * 100)}%` }}
            />
          </div>
          <Link href="/dashboard/library" className="btn-subtle mt-4">
            Manage files <Icon name="chevronRight" size={13} />
          </Link>
        </div>
      </section>

      <section className="card overflow-hidden">
        <SectionHeader icon="users" title="Connected accounts" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm font-semibold">
            {accountsUsed}{" "}
            <span className="font-medium text-muted">
              {Number.isFinite(accountCap) ? `of ${accountCap} accounts` : "accounts · unlimited on Pro"}
            </span>
          </p>
          <Link href="/dashboard/connections" className="btn-subtle">
            Manage accounts
          </Link>
        </div>
      </section>
    </div>
  );
}
