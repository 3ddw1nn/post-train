import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { createPost, listPosts, serializePost } from "@/lib/posts";

export async function POST(req: Request) {
  try {
    const ctx = await authenticateApiKey(req);
    const body = await req.json().catch(() => ({}));
    const post = await createPost(ctx.user, [ctx.workspace], body);
    return Response.json(await serializePost(post), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET(req: Request) {
  try {
    const ctx = await authenticateApiKey(req);
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 100);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    const { data, count } = await listPosts([ctx.workspace.id], {
      status: url.searchParams.get("status") ?? undefined,
      platform: url.searchParams.get("platform") ?? undefined,
      limit,
      offset,
    });
    return Response.json({ data: await Promise.all(data.map(serializePost)), count, limit, offset });
  } catch (e) {
    return jsonError(e);
  }
}
