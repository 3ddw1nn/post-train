import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { listRecords } from "@/lib/db";
import { DomainError, getPostRow } from "@/lib/posts";

export async function GET(req: Request) {
  try {
    const ctx = await authenticateApiKey(req);
    const url = new URL(req.url);
    const postId = url.searchParams.get("post_id");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;

    const where: string[] = ["p.workspace_id = ?"];
    const params: (string | number)[] = [ctx.workspace.id];
    if (postId) {
      const post = await getPostRow(postId);
      if (!post || post.workspace_id !== ctx.workspace.id) {
        throw new DomainError(404, "Post not found.");
      }
    }
    const posts = await listRecords<{ id: string; workspace_id: string }>("posts", {
      workspace_id: ctx.workspace.id,
    });
    const postIds = new Set(posts.map((p) => p.id));
    let rows = (await listRecords<Record<string, unknown>>("post_results"))
      .filter((r) => postIds.has(String(r.post_id)));
    if (postId) rows = rows.filter((r) => r.post_id === postId);
    rows.sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
    const count = rows.length;
    rows = rows.slice(offset, offset + limit);
    return Response.json({
      data: rows.map((r) => ({
        id: r.id,
        post_id: r.post_id,
        social_account_id: r.social_account_id,
        platform: r.platform,
        success: !!r.success,
        platform_post_id: r.platform_post_id,
        share_url: r.share_url,
        error_code: r.error_code,
        error_message: r.error_message,
        completed_at: r.completed_at,
      })),
      count,
      limit,
      offset,
    });
  } catch (e) {
    return jsonError(e);
  }
}
