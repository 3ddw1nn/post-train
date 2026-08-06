import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { listMedia, listFinishedStudioVideos } from "@/lib/media";
import { listStudioDrafts, mediaIdsInDrafts } from "@/lib/studio-drafts";

export async function GET(req: Request) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const studioVideo = new URL(req.url).searchParams.get("studio") === "video";
  if (studioVideo) return Response.json({ data: await listFinishedStudioVideos(ws.id) });

  // `in_draft` is a join, not a column: a Studio render sitting inside an open
  // draft is indistinguishable from a raw upload by row alone (studio_* are
  // cleared when a project returns to drafting). The Batch Scheduler uses it to
  // say how many files are still tied up in Studio, so scheduling one isn't a
  // surprise. Only computed for unfinished drafts — a finished project's
  // sources aren't "in progress" any more.
  const [media, drafts] = await Promise.all([listMedia(ws.id, 100, 0), listStudioDrafts(ws.id)]);
  const inDraft = mediaIdsInDrafts(drafts.filter((d) => d.status !== "finished"));
  return Response.json({
    ...media,
    data: media.data.map((row) => ({ ...row, in_draft: inDraft.has(row.id) })),
  });
}
