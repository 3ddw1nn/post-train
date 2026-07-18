import { clearSessionCookie, requireUser } from "@/lib/auth";
import { convexMutation } from "@/lib/db";
import { api } from "@/convex/_generated/api";

export async function POST() {
  const user = await requireUser();
  // Bumping the epoch invalidates every issued session token
  await convexMutation(api.users.incrementSessionEpoch, { id: user.id });
  await clearSessionCookie();
  return Response.json({ ok: true, redirect: "/signin" });
}
