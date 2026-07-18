import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { listAnalytics } from "@/lib/analytics";
import { DomainError } from "@/lib/posts";

export async function GET(req: Request) {
  try {
    const ctx = await authenticateApiKey(req);
    if (!analyticsAccess(await getSubscription(ctx.user.id))) {
      throw new DomainError(403, "Analytics requires a Creator, Growth or Pro plan.");
    }
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    const timeframe = url.searchParams.get("timeframe") as "7d" | "30d" | "90d" | "all" | null;
    const { data, count } = await listAnalytics(ctx.workspace.id, {
      platform: url.searchParams.get("platform") ?? undefined,
      timeframe: timeframe ?? undefined,
      limit,
      offset,
    });
    return Response.json({
      data: data.map(({ workspace_id: _ws, ...r }) => r),
      count,
      limit,
      offset,
    });
  } catch (e) {
    return jsonError(e);
  }
}
