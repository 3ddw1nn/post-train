import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";
import { cancelStudioJob, getStudioJob } from "@/lib/studio";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const job = await getStudioJob(id);
    const wsIds = new Set((await workspacesForUser(user.id)).map((w) => w.id));
    if (!job || !wsIds.has(job.workspace_id)) throw new DomainError(404, "Render not found.");
    const result = await cancelStudioJob(id, job.workspace_id);
    return Response.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
