import { requireUser } from "@/lib/auth";
import { insertRecord, now, uid } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const text = String(body?.body ?? "").trim();
  if (!text) {
    return Response.json({ error: { message: "Say something first 🙂" } }, { status: 400 });
  }
  await insertRecord("feedback", { id: uid(), user_id: user.id, body: text.slice(0, 4000), created_at: now() });
  return Response.json({ ok: true });
}
