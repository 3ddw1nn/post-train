import { cookies } from "next/headers";
import { getDb, now, uid } from "./db";
import type { User } from "./auth";
import { randomBytes } from "node:crypto";

export type Workspace = {
  id: string;
  owner_id: string;
  name: string;
  randomize_queue_time: number;
  webhook_url: string | null;
  webhook_secret: string;
  created_at: string;
};

const WS_COOKIE = "pt_ws";

export function workspacesForUser(userId: string): Workspace[] {
  return getDb()
    .prepare(
      `SELECT w.* FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = ? ORDER BY w.created_at`
    )
    .all(userId) as Workspace[];
}

export async function currentWorkspace(user: User): Promise<Workspace> {
  const all = workspacesForUser(user.id);
  const jar = await cookies();
  const wanted = jar.get(WS_COOKIE)?.value;
  return all.find((w) => w.id === wanted) ?? all[0];
}

export async function setCurrentWorkspace(id: string) {
  (await cookies()).set(WS_COOKIE, id, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
}

export function createWorkspace(ownerId: string, name: string): Workspace {
  const db = getDb();
  const id = uid();
  const ts = now();
  db.prepare(
    "INSERT INTO workspaces (id, owner_id, name, webhook_secret, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, ownerId, name, randomBytes(24).toString("hex"), ts);
  db.prepare(
    "INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)"
  ).run(id, ownerId, ts);
  const slot = db.prepare(
    "INSERT INTO queue_slots (workspace_id, time_local, days, created_at) VALUES (?, ?, '1111100', ?)"
  );
  slot.run(id, "11:00", ts);
  slot.run(id, "16:00", ts);
  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Workspace;
}

export function isWorkspaceMember(workspaceId: string, userId: string): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(workspaceId, userId);
}
