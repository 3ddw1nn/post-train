import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { DomainError, getPostRow } from "@/lib/posts";

export async function GET(req: Request) {
  try {
    const ctx = authenticateApiKey(req);
    const url = new URL(req.url);
    const postId = url.searchParams.get("post_id");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;

    const where: string[] = ["p.workspace_id = ?"];
    const params: (string | number)[] = [ctx.workspace.id];
    if (postId) {
      const post = getPostRow(postId);
      if (!post || post.workspace_id !== ctx.workspace.id) {
        throw new DomainError(404, "Post not found.");
      }
      where.push("r.post_id = ?");
      params.push(postId);
    }
    const db = getDb();
    const whereSql = where.join(" AND ");
    const count = (
      db
        .prepare(
          `SELECT COUNT(*) c FROM post_results r JOIN posts p ON p.id = r.post_id WHERE ${whereSql}`
        )
        .get(...params) as { c: number }
    ).c;
    const rows = db
      .prepare(
        `SELECT r.* FROM post_results r JOIN posts p ON p.id = r.post_id
         WHERE ${whereSql} ORDER BY r.completed_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Record<string, unknown>[];
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
