import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { getPostRow, duplicatePost, DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const post = await getPostRow(id);
    const wsIds = new Set((await workspacesForUser(user.id)).map((w) => w.id));
    if (!post || !wsIds.has(post.workspace_id)) throw new DomainError(404, "Post not found.");
    const draft = await duplicatePost(post, user.id);
    return Response.json({ ok: true, id: draft.id });
  } catch (e) {
    return jsonError(e);
  }
}
