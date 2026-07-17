import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { listMedia } from "@/lib/media";

export async function GET() {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  return Response.json(listMedia(ws.id, 100, 0));
}
