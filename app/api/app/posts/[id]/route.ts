import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { getPostRow, updatePost, deletePost, serializePost, DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";

async function ownedPost(id: string) {
  const user = await requireUser();
  const post = getPostRow(id);
  const wsIds = new Set(workspacesForUser(user.id).map((w) => w.id));
  if (!post || !wsIds.has(post.workspace_id)) {
    throw new DomainError(404, "Post not found.");
  }
  return post;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const post = await ownedPost(id);
    const body = await req.json().catch(() => ({}));
    return Response.json(serializePost(updatePost(post, body)));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const post = await ownedPost(id);
    deletePost(post);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
