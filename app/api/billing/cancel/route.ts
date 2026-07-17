import { requireUser } from "@/lib/auth";
import { cancelSubscription } from "@/lib/billing";

export async function POST() {
  const user = await requireUser();
  cancelSubscription(user.id);
  return Response.json({ ok: true });
}
