import { requireUser } from "@/lib/auth";
import { createWorkspace } from "@/lib/workspaces";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return Response.json({ error: { message: "Workspace name is required." } }, { status: 400 });
  }
  const ws = createWorkspace(user.id, name.slice(0, 60));
  return Response.json({ ok: true, id: ws.id });
}
