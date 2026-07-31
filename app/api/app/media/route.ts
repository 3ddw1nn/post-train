import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { listMedia, listFinishedStudioVideos } from "@/lib/media";

export async function GET(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const studioVideo = new URL(req.url).searchParams.get("studio") === "video";
  if (studioVideo) return Response.json({ data: await listFinishedStudioVideos(ws.id) });
  return Response.json(await listMedia(ws.id, 100, 0));
}
