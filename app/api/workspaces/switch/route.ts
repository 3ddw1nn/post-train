import { requireUser } from "@/lib/auth";
import { isWorkspaceMember, setCurrentWorkspace } from "@/lib/workspaces";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!isWorkspaceMember(id, user.id)) {
    return Response.json({ error: { message: "Workspace not found." } }, { status: 404 });
  }
  await setCurrentWorkspace(id);
  return Response.json({ ok: true });
}
