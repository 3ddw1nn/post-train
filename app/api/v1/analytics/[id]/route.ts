import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { findRecord } from "@/lib/db";
import { DomainError } from "@/lib/posts";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const api = await authenticateApiKey(req);
    const { id } = await ctx.params;
    const row = await findRecord<Record<string, unknown>>("analytics_records", {
      id,
      workspace_id: api.workspace.id,
    });
    if (!row) throw new DomainError(404, "Analytics record not found.");
    const { workspace_id: _ws, ...rest } = row;
    return Response.json(rest);
  } catch (e) {
    return jsonError(e);
  }
}
