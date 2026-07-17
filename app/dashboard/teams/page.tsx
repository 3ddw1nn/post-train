import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { teamsCreate } from "@/lib/entitlements";
import { getDb } from "@/lib/db";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/ui";
import { CreateTeamButton, InviteForm, RefreshButton } from "./teams-widgets";

export const metadata = { title: "Teams" };

type TeamRow = { id: string; name: string; creator_id: string; created_at: string };
type MemberRow = { email_invited: string; status: string; display_name: string | null };

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; error?: string }>;
}) {
  const user = await requireOnboardedUser();
  const sub = getSubscription(user.id);
  const canCreate = teamsCreate(sub);
  const params = await searchParams;
  const db = getDb();

  const teams = db
    .prepare(
      `SELECT DISTINCT t.* FROM teams t
       LEFT JOIN team_members m ON m.team_id = t.id
       WHERE t.creator_id = ? OR (m.user_id = ? AND m.status = 'active')
       ORDER BY t.created_at`
    )
    .all(user.id, user.id) as TeamRow[];
  const memberStmt = db.prepare(
    `SELECT m.email_invited, m.status, u.display_name FROM team_members m
     LEFT JOIN users u ON u.id = m.user_id WHERE m.team_id = ? ORDER BY m.created_at`
  );

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Teams</h1>
      <p className="mt-1 text-sm text-muted">
        Share a workspace — everyone posts to the same connected accounts.
      </p>

      {params.joined && (
        <p className="mt-3 rounded-xl bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary-dark">
          You&apos;ve joined the team — its workspace is now in your switcher. 🎉
        </p>
      )}
      {params.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {params.error === "wrong_account"
            ? "That invite was sent to a different email address."
            : "This invite link is invalid or expired."}
        </p>
      )}

      {!canCreate && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-blue-600 p-4 text-white">
          <div>
            <p className="font-bold">Pro subscription required to create teams</p>
            <p className="text-sm text-blue-100">
              You can still join teams as a member without Pro!
            </p>
          </div>
          <Link href="/dashboard/settings/plans" className="btn bg-white text-blue-700 hover:bg-blue-50">
            Upgrade to Pro
          </Link>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-bold">My Teams</h2>
        <div className="flex gap-2">
          <RefreshButton />
          {canCreate && <CreateTeamButton />}
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="card mt-3">
          <EmptyState
            icon="users"
            title="No teams yet"
            subtitle={
              canCreate
                ? "Create a team and invite people into this workspace."
                : "Upgrade to Pro to create and manage teams — or accept an invite to join one."
            }
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {teams.map((t) => {
            const members = memberStmt.all(t.id) as MemberRow[];
            const isCreator = t.creator_id === user.id;
            return (
              <div key={t.id} className="card p-5">
                <div className="flex items-center gap-2">
                  <Icon name="users" size={18} className="text-muted" />
                  <p className="font-bold">{t.name}</p>
                  {isCreator && (
                    <span className="pill bg-gray-100 text-gray-600">You manage this</span>
                  )}
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {members.length === 0 && (
                    <p className="text-sm text-muted">No members yet — invite someone below.</p>
                  )}
                  {members.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          m.status === "active" ? "bg-primary" : "bg-amber-400"
                        }`}
                      />
                      <span className="font-medium">{m.display_name ?? m.email_invited}</span>
                      <span className="ml-auto text-xs text-muted">
                        {m.status === "active" ? "member" : "invite pending"}
                      </span>
                    </div>
                  ))}
                </div>
                {isCreator && (
                  <div className="mt-4 border-t border-line pt-3">
                    <InviteForm teamId={t.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
