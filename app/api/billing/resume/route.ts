import { requireUser } from "@/lib/auth";
import { resumeSubscription } from "@/lib/billing";

export async function POST() {
  const user = await requireUser();
  await resumeSubscription(user.id);
  return Response.json({ ok: true });
}
