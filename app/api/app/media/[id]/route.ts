import { requireUser } from "@/lib/auth";
import { deleteMedia, setMediaThumbnail } from "@/lib/media";
import { currentWorkspace } from "@/lib/workspaces";

// Thumbnail Maker's "attach to video" step — points a video's row at the
// media id of the cover image it just made. Nothing reads this yet at
// publish time; it's the metadata slot for when that gets wired up.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!("thumbnail_media_id" in body)) {
    return Response.json({ error: { message: "Nothing to update." } }, { status: 400 });
  }
  const thumbnailMediaId = typeof body.thumbnail_media_id === "string" ? body.thumbnail_media_id : null;
  const row = await setMediaThumbnail(ws.id, id, thumbnailMediaId);
  if (!row) return Response.json({ error: { message: "Media not found." } }, { status: 404 });
  return Response.json(row);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const { id } = await ctx.params;
  try {
    const ok = await deleteMedia(ws.id, id);
    if (!ok) {
      return Response.json({ error: { message: "Media not found." } }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "Could not delete media." } },
      { status: 400 },
    );
  }
}
