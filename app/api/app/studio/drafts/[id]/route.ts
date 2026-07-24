import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { jsonError } from "@/lib/api-auth";
import { deleteStudioDraft } from "@/lib/studio-drafts";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    const { id } = await ctx.params;
    const ok = await deleteStudioDraft(ws.id, id);
    return Response.json({ ok });
  } catch (e) {
    return jsonError(e);
  }
}
