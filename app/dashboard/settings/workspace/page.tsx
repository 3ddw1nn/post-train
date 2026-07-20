import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { ownedWorkspaceCap } from "@/lib/entitlements";
import { memberRole, canManageWorkspace, type WorkspaceRole } from "@/lib/permissions";
import { listRecords, findRecord, insertRecord, uid, now } from "@/lib/db";
import { Icon } from "@/components/icons";
import {
  RefreshButton,
  InviteForm,
  MemberRow,
  LeaveButton,
  TransferOwnership,
  DeleteWorkspace,
} from "./workspace-widgets";

export const metadata = { title: "Workspace" };

type TeamRow = { id: string; workspace_id: string };
type MemberRow_ = { id: number; team_id: string; user_id: string | null; email_invited: string; status: string; created_at: string };

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; error?: string }>;
}) {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  const sub = await getSubscription(user.id);
  const params = await searchParams;

  const role = await memberRole(ws.id, user.id);
  const canManage = await canManageWorkspace(ws.id, user.id);
  const isOwner = role === "owner";

  // Exactly one team per workspace — auto-create the roster if this workspace predates it.
  let team = await findRecord<TeamRow>("teams", { workspace_id: ws.id });
  if (!team) {
    const id = uid();
    await insertRecord("teams", { id, name: ws.name, creator_id: ws.owner_id, workspace_id: ws.id, created_at: now() });
    team = { id, workspace_id: ws.id };
  }

  const [invites, workspaceMembers, users] = await Promise.all([
    listRecords<MemberRow_>("team_members", { team_id: team.id }),
    listRecords<{ workspace_id: string; user_id: string; role: string }>("workspace_members", { workspace_id: ws.id }),
    listRecords<{ id: string; display_name: string; email: string }>("users"),
  ]);

  // Roster = every real workspace_members row (source of truth — includes the
  // owner, who never went through the invite flow) plus any invite that's
  // still pending acceptance.
  const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  const activeMembers = [
    ...workspaceMembers.map((wm) => {
      const u = users.find((u) => u.id === wm.user_id);
      const invite = invites.find((i) => i.user_id === wm.user_id);
      return {
        id: invite?.id ?? 0,
        user_id: wm.user_id,
        email: u?.email ?? "",
        status: "active",
        name: u?.display_name || u?.email || "Unknown",
        role: wm.role as WorkspaceRole,
      };
    }),
    ...invites
      .filter((i) => i.status === "invited")
      .map((i) => ({
        id: i.id,
        user_id: null,
        email: i.email_invited,
        status: "invited",
        name: i.email_invited,
        role: null as WorkspaceRole | null,
      })),
  ].sort((a, b) => (ROLE_RANK[a.role ?? "member"] ?? 3) - (ROLE_RANK[b.role ?? "member"] ?? 3) || a.name.localeCompare(b.name));

  const admins = activeMembers.filter((m) => m.role === "admin" && m.user_id);
  const cap = ownedWorkspaceCap(sub);
  const owned = await listRecords("workspaces", { owner_id: user.id });

  return (
    <div className="fade-up mx-auto max-w-3xl">
      {params.joined && (
        <p className="mb-3 rounded-xl bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary-dark">
          You&apos;ve joined the workspace. 🎉
        </p>
      )}
      {params.error && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {params.error === "wrong_account"
            ? "That invite was sent to a different email address."
            : params.error === "join_cap"
              ? "You're at your plan's limit for workspaces you can join — leave one first or upgrade."
              : "This invite link is invalid or expired."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-muted">
            You own {owned.length} of {cap} workspace{cap === 1 ? "" : "s"}
          </p>
        </div>
        <RefreshButton />
      </div>

      <div className="card mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-page/50 px-5 py-3">
          <Icon name="users" size={16} className="text-muted" />
          <p className="text-sm font-bold">{ws.name}</p>
          {role && <span className="pill bg-gray-100 capitalize text-gray-600">{role}</span>}
          <span className="ml-auto text-xs font-semibold text-muted">
            {activeMembers.length} member{activeMembers.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-col divide-y divide-line">
          {activeMembers.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted">No members yet — invite someone below.</p>
          )}
          {activeMembers.map((m) => (
            <MemberRow
              key={m.user_id ?? `invite-${m.id}`}
              teamMemberId={m.id}
              userId={m.user_id}
              name={m.name}
              email={m.email}
              status={m.status}
              role={m.role}
              isSelf={m.user_id === user.id}
              actorRole={role}
              actorCanManage={canManage}
            />
          ))}
        </div>
        {canManage && (
          <div className="border-t border-line px-5 py-3">
            <InviteForm teamId={team.id} />
          </div>
        )}
        {!isOwner && role && (
          <div className="border-t border-line px-5 py-3">
            <LeaveButton />
          </div>
        )}
      </div>

      {isOwner && (
        <>
          <TransferOwnership admins={admins.map((a) => ({ userId: a.user_id!, name: a.name }))} />
          <DeleteWorkspace workspaceId={ws.id} workspaceName={ws.name} />
        </>
      )}
    </div>
  );
}
