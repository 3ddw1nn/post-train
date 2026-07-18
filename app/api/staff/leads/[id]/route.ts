import { requireStaffUser } from "@/lib/auth";
import { patchRecord, now } from "@/lib/db";

const VALID_STATUSES = new Set(["new", "contacted", "qualified", "unqualified", "converted", "lost"]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireStaffUser();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);

  const patch: Record<string, unknown> = { updated_at: now() };
  if (typeof body?.status === "string") {
    if (!VALID_STATUSES.has(body.status)) {
      return Response.json({ error: { message: "Invalid status." } }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (typeof body?.notes === "string") {
    patch.notes = body.notes.slice(0, 4000) || null;
  }

  await patchRecord("leads", id, patch);
  return Response.json({ ok: true });
}
