import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { createUploadUrl } from "@/lib/media";
import { DomainError } from "@/lib/posts";

export async function POST(req: Request) {
  try {
    const ctx = await authenticateApiKey(req);
    const body = await req.json().catch(() => null);
    if (!body?.mime_type || !body?.name) {
      throw new DomainError(400, "mime_type and name are required.");
    }
    const result = await createUploadUrl(
      ctx.workspace.id,
      {
        mime_type: String(body.mime_type),
        size_bytes: Number(body.size_bytes ?? 0),
        name: String(body.name),
      },
      new URL(req.url).origin
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof Error && !(e as DomainError).status) {
      return jsonError(new DomainError(400, e.message));
    }
    return jsonError(e);
  }
}
