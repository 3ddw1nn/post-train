import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/posts";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const api = authenticateApiKey(req);
    const { id } = await ctx.params;
    const row = getDb()
      .prepare("SELECT * FROM analytics_records WHERE id = ? AND workspace_id = ?")
      .get(id, api.workspace.id) as Record<string, unknown> | undefined;
    if (!row) throw new DomainError(404, "Analytics record not found.");
    const { workspace_id: _ws, ...rest } = row;
    return Response.json(rest);
  } catch (e) {
    return jsonError(e);
  }
}
