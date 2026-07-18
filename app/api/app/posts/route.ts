import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { createPost, serializePost } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const post = await createPost(user, await workspacesForUser(user.id), body);
    return Response.json(await serializePost(post), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
