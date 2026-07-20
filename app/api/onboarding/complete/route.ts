import { requireUser } from "@/lib/auth";
import { patchRecord, now } from "@/lib/db";

export async function POST() {
  const user = await requireUser();
  if (!user.onboarded_at) {
    await patchRecord("users", user.id, { onboarded_at: now() });
  }
  return Response.json({ ok: true });
}
