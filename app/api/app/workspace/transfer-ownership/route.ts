import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { isWorkspaceOwner, memberRole } from "@/lib/permissions";
import { getSubscription } from "@/lib/billing";
import { ownedWorkspaceCap } from "@/lib/entitlements";
import { convexMutation, listRecords, recordById } from "@/lib/db";
import { api } from "@/convex/_generated/api";

/** Owner hands ownership to a current admin — old owner becomes admin. */
export async function POST(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await isWorkspaceOwner(ws.id, user.id))) {
    return Response.json({ error: { message: "Only the workspace owner can transfer ownership." } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const toUserId = String(body?.user_id ?? "");
  if (!toUserId || toUserId === user.id) {
    return Response.json({ error: { message: "Pick someone else to transfer ownership to." } }, { status: 400 });
  }
  const targetRole = await memberRole(ws.id, toUserId);
  if (targetRole !== "admin") {
    return Response.json({ error: { message: "Ownership can only transfer to a current admin — promote them first." } }, { status: 400 });
  }

  const targetUser = await recordById<{ display_name: string | null; email: string; is_staff?: boolean }>("users", toUserId);
  if (!targetUser?.is_staff) {
    const sub = await getSubscription(toUserId);
    const cap = ownedWorkspaceCap(sub);
    const owned = await listRecords("workspaces", { owner_id: toUserId });
    if (owned.length >= cap) {
      const name = targetUser?.display_name || targetUser?.email || "This admin";
      return Response.json(
        {
          error: {
            message: `${name} is at their workspace limit (${owned.length}/${cap}) — they need to drop a workspace before you can transfer ownership.`,
          },
        },
        { status: 400 }
      );
    }
  }

  await convexMutation(api.workspaces.transferOwnership, {
    workspace_id: ws.id,
    from_user_id: user.id,
    to_user_id: toUserId,
  });
  return Response.json({ ok: true });
}
