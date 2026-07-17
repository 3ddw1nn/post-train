import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { syncAnalytics } from "@/lib/analytics";

export async function POST(req: Request) {
  const user = await requireUser();
  const sub = getSubscription(user.id);
  if (!analyticsAccess(sub)) {
    return Response.json(
      { error: { message: "Analytics requires a Creator, Growth or Pro plan." } },
      { status: 403 }
    );
  }
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => ({}));
  const triggered = syncAnalytics(ws.id, body?.platform ? String(body.platform) : undefined);
  return Response.json({ triggered }, { status: 202 });
}
