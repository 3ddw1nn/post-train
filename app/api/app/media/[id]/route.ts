import { requireUser } from "@/lib/auth";
import { deleteMedia } from "@/lib/media";
import { currentWorkspace } from "@/lib/workspaces";

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
