import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { deleteMedia } from "@/lib/media";
import { DomainError } from "@/lib/posts";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const api = authenticateApiKey(req);
    const { id } = await ctx.params;
    if (!deleteMedia(api.workspace.id, id)) {
      throw new DomainError(404, "Media not found.");
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
