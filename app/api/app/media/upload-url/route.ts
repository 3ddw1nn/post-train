import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { createUploadUrl } from "@/lib/media";

export async function POST(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const body = await req.json().catch(() => null);
  if (!body?.mime_type || !body?.name) {
    return Response.json(
      { error: { message: "mime_type and name are required." } },
      { status: 400 }
    );
  }
  try {
    const result = createUploadUrl(
      ws.id,
      {
        mime_type: String(body.mime_type),
        size_bytes: Number(body.size_bytes ?? 0),
        name: String(body.name),
      },
      new URL(req.url).origin
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "Upload failed." } },
      { status: 400 }
    );
  }
}
