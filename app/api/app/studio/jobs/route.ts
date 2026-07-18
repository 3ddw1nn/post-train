import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";
import { aiUsageThisMonth, createStudioJob, listStudioJobs } from "@/lib/studio";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    if (!studioAccess(await getSubscription(user.id))) {
      throw new DomainError(403, "Content Studio requires a paid plan.", "paywall");
    }
    const body = await req.json().catch(() => ({}));
    const job = await createStudioJob(user.id, ws.id, body);
    return Response.json(job, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    const [jobs, usage] = await Promise.all([listStudioJobs(ws.id), aiUsageThisMonth(ws.id)]);
    return Response.json({ data: jobs, ai_used: usage.used, ai_cap: usage.cap });
  } catch (e) {
    return jsonError(e);
  }
}
