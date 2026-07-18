import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { teamsCreate } from "@/lib/entitlements";
import { canManageWorkspace, type WorkspaceRole } from "@/lib/permissions";
import { listRecords } from "@/lib/db";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/ui";
import { CreateTeamButton, InviteForm, RefreshButton, MemberActions } from "./teams-widgets";

export const metadata = { title: "Teams" };

type TeamRow = { id: string; name: string; creator_id: string; workspace_id: string; created_at: string };
type MemberRow = { id: number; email_invited: string; status: string; display_name: string | null };

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; error?: string }>;
}) {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const canCreate = teamsCreate(sub);
  const params = await searchParams;
  const allTeams = await listRecords<TeamRow>("teams");
  const allMembers = await listRecords<
    (MemberRow & { team_id: string; user_id: string | null; created_at: string })
  >("team_members");
  const users = await listRecords<{ id: string; display_name: string }>("users");
  const workspaceMembers = await listRecords<{ workspace_id: string; user_id: string; role: string }>(
    "workspace_members"
  );
  const activeTeamIds = new Set(
    allMembers.filter((m) => m.user_id === user.id && m.status === "active").map((m) => m.team_id)
  );
  const teams = allTeams
    .filter((t) => t.creator_id === user.id || activeTeamIds.has(t.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const canManageByTeam = new Map(
    await Promise.all(teams.map(async (t) => [t.id, await canManageWorkspace(t.workspace_id, user.id)] as const))
  );
  const roleOf = (workspaceId: string, userId: string | null): WorkspaceRole | null =>
    (workspaceMembers.find((m) => m.workspace_id === workspaceId && m.user_id === userId)?.role as WorkspaceRole) ??
    null;

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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary-deep p-4 text-white">
          <div>
            <p className="font-bold">Pro subscription required to create teams</p>
            <p className="text-sm text-white/80">
              You can still join teams as a member without Pro!
            </p>
          </div>
          <Link href="/dashboard/settings/plans" className="btn bg-white text-primary-deep hover:bg-primary-soft">
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
            const members = allMembers
              .filter((m) => m.team_id === t.id && m.status !== "removed")
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((m) => ({
                id: m.id,
                user_id: m.user_id,
                email_invited: m.email_invited,
                status: m.status,
                display_name: m.user_id
                  ? users.find((u) => u.id === m.user_id)?.display_name ?? null
                  : null,
                role: roleOf(t.workspace_id, m.user_id),
              }));
            const canManage = canManageByTeam.get(t.id) ?? false;
            return (
              <div key={t.id} className="card p-5">
                <div className="flex items-center gap-2">
                  <Icon name="users" size={18} className="text-muted" />
                  <p className="font-bold">{t.name}</p>
                  {canManage && (
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
                      <span className="ml-auto text-xs capitalize text-muted">
                        {m.status === "active" ? m.role ?? "member" : "invite pending"}
                      </span>
                      {canManage && m.status === "active" && m.role !== "owner" && m.user_id && (
                        <MemberActions userId={m.user_id} teamMemberId={m.id} role={m.role ?? "member"} />
                      )}
                    </div>
                  ))}
                </div>
                {canManage && (
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
