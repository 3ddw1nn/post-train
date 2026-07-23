import { convexMutation, convexQuery } from "@/lib/db";
import { api } from "@/convex/_generated/api";

type Recreation = {
  status: "pending" | "complete" | "error";
  summary: string;
  plan: string;
  provider: string | null;
} | null;

// GET ?key=<contentKey> — read the cached AI recreation (poll target).
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key")?.trim();
  if (!key) return Response.json({ recreation: null });
  const recreation = await convexQuery<Recreation>(api.trendRecreations.get, { contentKey: key });
  return Response.json({ recreation });
}

// POST — request generation (no-op if already generated). First click generates;
// the result is cached in Convex and reused for everyone after.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const contentKey = typeof body?.contentKey === "string" ? body.contentKey : "";
  if (!contentKey) return Response.json({ error: "missing contentKey" }, { status: 400 });
  try {
    await convexMutation(api.trendRecreations.request, {
      contentKey,
      title: String(body.title ?? "").slice(0, 300),
      platform: String(body.platform ?? "unknown"),
      format: String(body.format ?? "post"),
      caption: String(body.caption ?? "").slice(0, 1500),
      stats: String(body.stats ?? ""),
      sourceUrl: String(body.sourceUrl ?? ""),
    });
  } catch {
    return Response.json({ error: "Couldn't start the summary. Try again." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
