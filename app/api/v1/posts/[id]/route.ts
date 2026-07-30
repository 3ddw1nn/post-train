import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { deletePost, findPost, serializePost, updatePost } from "@/lib/posts";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const api = await authenticateApiKey(req);
    const { id } = await ctx.params;
    return Response.json(await serializePost(await findPost(api.workspace.id, id)));
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const api = await authenticateApiKey(req);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    return Response.json(await serializePost(await updatePost(await findPost(api.workspace.id, id), body)));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const api = await authenticateApiKey(req);
    const { id } = await ctx.params;
    await deletePost(await findPost(api.workspace.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
