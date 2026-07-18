import { requireUser } from "@/lib/auth";
import { patchRecord } from "@/lib/db";

export async function POST() {
  const user = await requireUser();
  await patchRecord("users", user.id, { upsell_dismissed: 1 });
  return Response.json({ ok: true });
}
