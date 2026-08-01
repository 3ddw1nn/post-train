import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { jsonError } from "@/lib/api-auth";
import { DomainError } from "@/lib/posts";
import { deleteStudioDraft, setStudioDraftStatus } from "@/lib/studio-drafts";

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

// Flips a draft between "finished" (set alongside marking its output media
// finished — see /api/app/studio/finish) and "drafting" (set when the user
// confirms they want to edit a finished draft again).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status === "finished" || body.status === "drafting" ? body.status : null;
    const finishedMediaIds = Array.isArray(body.finished_media_ids)
      ? [...new Set(body.finished_media_ids.filter((id): id is string => typeof id === "string"))].slice(0, 12)
      : undefined;
    if (!status) throw new DomainError(400, "Invalid draft status.");
    const draft = await setStudioDraftStatus(ws.id, id, status, finishedMediaIds);
    if (!draft) throw new DomainError(404, "Draft not found.");
    return Response.json(draft);
  } catch (e) {
    return jsonError(e);
  }
}
