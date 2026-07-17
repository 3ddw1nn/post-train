import { requireUser } from "@/lib/auth";
import { pauseSubscription } from "@/lib/billing";

export async function POST() {
  const user = await requireUser();
  pauseSubscription(user.id);
  return Response.json({ ok: true });
}
