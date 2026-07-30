import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";
import { deleteStudioJob, getStudioJob } from "@/lib/studio";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const job = await getStudioJob(id);
    const wsIds = new Set((await workspacesForUser(user.id)).map((w) => w.id));
    if (!job || !wsIds.has(job.workspace_id)) throw new DomainError(404, "Job not found.");
    return Response.json(job);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const job = await getStudioJob(id);
    const wsIds = new Set((await workspacesForUser(user.id)).map((w) => w.id));
    if (!job || !wsIds.has(job.workspace_id)) throw new DomainError(404, "Video not found.");
    const deleted = await deleteStudioJob(id, job.workspace_id);
    if (!deleted) throw new DomainError(404, "Video not found.");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
