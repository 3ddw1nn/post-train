import { getDb } from "./db";
import type { SocialAccountRow } from "./posts";

/** Connected (non-removed) accounts for a workspace. */
export function accountsForWorkspace(workspaceId: string): SocialAccountRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM social_accounts WHERE workspace_id = ? AND status != 'disconnected' ORDER BY platform, connected_at"
    )
    .all(workspaceId) as SocialAccountRow[];
}

export function countAccounts(workspaceId: string): number {
  return (
    getDb()
      .prepare(
        "SELECT COUNT(*) c FROM social_accounts WHERE workspace_id = ? AND status != 'disconnected'"
      )
      .get(workspaceId) as { c: number }
  ).c;
}
