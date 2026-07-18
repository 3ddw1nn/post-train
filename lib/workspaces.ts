import { cookies } from "next/headers";
import { convexMutation, convexQuery, uid } from "./db";
import type { User } from "./auth";
import { randomBytes } from "node:crypto";
import { api } from "@/convex/_generated/api";

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

export async function workspacesForUser(userId: string): Promise<Workspace[]> {
  return await convexQuery<Workspace[]>(api.workspaces.listForUser, { user_id: userId });
}

export async function currentWorkspace(user: User): Promise<Workspace> {
  const all = await workspacesForUser(user.id);
  const jar = await cookies();
  const wanted = jar.get(WS_COOKIE)?.value;
  return all.find((w) => w.id === wanted) ?? all[0];
}

export async function setCurrentWorkspace(id: string) {
  (await cookies()).set(WS_COOKIE, id, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
}

export async function createWorkspace(ownerId: string, name: string): Promise<Workspace> {
  const id = uid();
  return await convexMutation<Workspace>(api.workspaces.createWorkspace, {
    id,
    owner_id: ownerId,
    name,
    webhook_secret: randomBytes(24).toString("hex"),
  });
}

export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  return await convexQuery<boolean>(api.workspaces.isMember, {
    workspace_id: workspaceId,
    user_id: userId,
  });
}
