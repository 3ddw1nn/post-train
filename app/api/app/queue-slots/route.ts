import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { canManageWorkspace } from "@/lib/permissions";
import { convexMutation, nextNumberId, patchRecord } from "@/lib/db";
import { api } from "@/convex/_generated/api";

const FORBIDDEN = Response.json(
  { error: { message: "Only workspace owners and admins can manage the posting queue." } },
  { status: 403 }
);

export async function POST(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) return FORBIDDEN;
  const body = await req.json().catch(() => null);
  const time = String(body?.time ?? "");
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: { message: "Pick a valid time." } }, { status: 400 });
  }
  const days = /^[01]{7}$/.test(String(body?.days)) ? String(body.days) : "1111100";
  await convexMutation(api.queue.upsertSlot, {
    workspace_id: ws.id,
    id: await nextNumberId("queue_slots"),
    time_local: time,
    days,
  });
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) return FORBIDDEN;
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const days = String(body?.days ?? "");
  if (!/^[01]{7}$/.test(days)) {
    return Response.json({ error: { message: "Invalid days." } }, { status: 400 });
  }
  const row = await patchRecord("queue_slots", id, { days });
  if (!row) {
    return Response.json({ error: { message: "Slot not found." } }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  if (!(await canManageWorkspace(ws.id, user.id))) return FORBIDDEN;
  const body = await req.json().catch(() => null);
  await convexMutation(api.queue.deleteSlot, { id: Number(body?.id), workspace_id: ws.id });
  return Response.json({ ok: true });
}
