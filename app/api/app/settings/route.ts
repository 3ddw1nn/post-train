import { requireUser } from "@/lib/auth";
import { patchRecord } from "@/lib/db";

const BOOL_FIELDS = [
  "pref_24h_time",
  "pref_filename_caption",
  "pref_server_video_processing",
  "email_automation",
  "email_failure_alerts",
  "email_post_summary",
] as const;

export async function PATCH(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const f of BOOL_FIELDS) {
    if (f in body) {
      patch[f] = body[f] ? 1 : 0;
    }
  }
  if (typeof body.display_name === "string" && body.display_name.trim()) {
    patch.display_name = body.display_name.trim().slice(0, 80);
  }
  if (body.weekly_posting_goal !== undefined) {
    const n = Math.max(0, Math.min(100, Number(body.weekly_posting_goal) || 0));
    patch.weekly_posting_goal = n;
  }
  if (Object.keys(patch).length) await patchRecord("users", user.id, patch);
  return Response.json({ ok: true });
}
