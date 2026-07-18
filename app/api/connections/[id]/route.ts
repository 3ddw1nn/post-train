import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { canManageWorkspace } from "@/lib/permissions";
import { convexMutation, convexQuery } from "@/lib/db";
import { api } from "@/convex/_generated/api";

async function ownedAccount(idRaw: string) {
  const user = await requireUser();
  const wsIds = (await workspacesForUser(user.id)).map((w) => w.id);
  const accounts = await convexQuery<{ id: number; workspace_id: string }[]>(api.accounts.getMany, {
    ids: [Number(idRaw)],
  });
  const account = accounts.find((a) => wsIds.includes(a.workspace_id));
  return { user, account: account ?? null };
}

const FORBIDDEN = Response.json(
  { error: { message: "Only workspace owners and admins can manage connections." } },
  { status: 403 }
);

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, account } = await ownedAccount(id);
  if (!account) {
    return Response.json({ error: { message: "Account not found." } }, { status: 404 });
  }
  if (!(await canManageWorkspace(account.workspace_id, user.id))) return FORBIDDEN;
  // Keep the row for history integrity of past results; mark disconnected.
  // Pending scheduled posts to it will fail at publish time with a clear error (spec 11 §6).
  await convexMutation(api.accounts.patchAccount, { id: account.id, patch: { status: "disconnected" } });
  return Response.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, account } = await ownedAccount(id);
  if (!account) {
    return Response.json({ error: { message: "Account not found." } }, { status: 404 });
  }
  if (!(await canManageWorkspace(account.workspace_id, user.id))) return FORBIDDEN;
  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? "");
  if (!["active", "needs_reauth"].includes(status)) {
    return Response.json({ error: { message: "Invalid status." } }, { status: 400 });
  }
  await convexMutation(api.accounts.patchAccount, { id: account.id, patch: { status } });
  return Response.json({ ok: true });
}
