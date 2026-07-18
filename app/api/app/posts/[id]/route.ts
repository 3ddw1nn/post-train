import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { canManageWorkspace } from "@/lib/permissions";
import { getPostRow, updatePost, deletePost, serializePost, DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";

async function ownedPost(id: string) {
  const user = await requireUser();
  const post = await getPostRow(id);
  const wsIds = new Set((await workspacesForUser(user.id)).map((w) => w.id));
  if (!post || !wsIds.has(post.workspace_id)) {
    throw new DomainError(404, "Post not found.");
  }
  return { user, post };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { post } = await ownedPost(id);
    const body = await req.json().catch(() => ({}));
    return Response.json(await serializePost(await updatePost(post, body)));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user, post } = await ownedPost(id);
    if (post.created_by !== user.id && !(await canManageWorkspace(post.workspace_id, user.id))) {
      throw new DomainError(403, "Only the post's creator or a workspace owner/admin can delete it.");
    }
    await deletePost(post);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
