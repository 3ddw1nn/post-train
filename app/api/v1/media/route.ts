import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { listMedia } from "@/lib/media";

export async function GET(req: Request) {
  try {
    const ctx = authenticateApiKey(req);
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    const { data, count } = listMedia(ctx.workspace.id, limit, offset);
    return Response.json({
      data: data.map((m) => ({
        id: m.id,
        name: m.name,
        mime_type: m.mime_type,
        size_bytes: m.size_bytes,
        kind: m.kind,
        created_at: m.created_at,
        url: `${new URL(req.url).origin}/api/media-file/${m.id}`,
      })),
      count,
      limit,
      offset,
    });
  } catch (e) {
    return jsonError(e);
  }
}
