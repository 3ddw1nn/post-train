import { convexQuery } from "./db";
import { api } from "@/convex/_generated/api";
import type { SocialAccountRow } from "./posts";

/** Connected (non-removed) accounts for a workspace. */
export async function accountsForWorkspace(workspaceId: string): Promise<SocialAccountRow[]> {
  return await convexQuery<SocialAccountRow[]>(api.accounts.listForWorkspace, {
    workspace_id: workspaceId,
  });
}

export async function countAccounts(workspaceId: string): Promise<number> {
  return (await accountsForWorkspace(workspaceId)).length;
}
