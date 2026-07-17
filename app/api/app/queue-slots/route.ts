import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getDb, now } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const time = String(body?.time ?? "");
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: { message: "Pick a valid time." } }, { status: 400 });
  }
  const days = /^[01]{7}$/.test(String(body?.days)) ? String(body.days) : "1111100";
  getDb()
    .prepare(
      "INSERT INTO queue_slots (workspace_id, time_local, days, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(ws.id, time, days, now());
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const days = String(body?.days ?? "");
  if (!/^[01]{7}$/.test(days)) {
    return Response.json({ error: { message: "Invalid days." } }, { status: 400 });
  }
  const res = getDb()
    .prepare("UPDATE queue_slots SET days = ? WHERE id = ? AND workspace_id = ?")
    .run(days, id, ws.id);
  if (res.changes === 0) {
    return Response.json({ error: { message: "Slot not found." } }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  getDb()
    .prepare("DELETE FROM queue_slots WHERE id = ? AND workspace_id = ?")
    .run(Number(body?.id), ws.id);
  return Response.json({ ok: true });
}
