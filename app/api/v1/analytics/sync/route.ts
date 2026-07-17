import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { syncAnalytics } from "@/lib/analytics";
import { DomainError } from "@/lib/posts";

export async function POST(req: Request) {
  try {
    const ctx = authenticateApiKey(req);
    if (!analyticsAccess(getSubscription(ctx.user.id))) {
      throw new DomainError(403, "Analytics requires a Creator, Growth or Pro plan.");
    }
    const platform = new URL(req.url).searchParams.get("platform") ?? undefined;
    const triggered = syncAnalytics(ctx.workspace.id, platform);
    return Response.json({ triggered }, { status: 202 });
  } catch (e) {
    return jsonError(e);
  }
}
