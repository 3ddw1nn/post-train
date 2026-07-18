// Workspace-scoped roles. `workspace_members.role` has always been written
// ("owner" on workspace creation, "member" on team-invite acceptance) but
// nothing read it — every member had full access to everything. These
// helpers are the single place that decides who can manage a workspace.
import { findRecord } from "./db";

export type WorkspaceRole = "owner" | "admin" | "member";

export async function memberRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const row = await findRecord<{ role: string }>("workspace_members", {
    workspace_id: workspaceId,
    user_id: userId,
  });
  return (row?.role as WorkspaceRole) ?? null;
}

/** Owner or admin — can manage settings, connections, members, API keys. */
export async function canManageWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const role = await memberRole(workspaceId, userId);
  return role === "owner" || role === "admin";
}

export async function isWorkspaceOwner(workspaceId: string, userId: string): Promise<boolean> {
  return (await memberRole(workspaceId, userId)) === "owner";
}
