// HTTP-triggered worker tick for hosts that sleep on idle (e.g. Render's free
// tier). Register this URL with a free external pinger (e.g. cron-job.org)
// every ~5 minutes: https://your-app/api/cron/tick?token=$CRON_SECRET
// The request itself counts as inbound traffic, so it also prevents/reverses
// idle spin-down. On always-on hosts (WORKER_ENABLED=1) this is unused —
// lib/worker.ts's in-process interval already covers it.
import { timingSafeEqual } from "node:crypto";
import { runWorkerTick } from "@/lib/worker";

function validToken(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse to run unauthenticated
  const provided =
    new URL(req.url).searchParams.get("token") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!validToken(req)) {
    return Response.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  // Acknowledge immediately instead of awaiting the tick. A tick can spend
  // minutes in ffmpeg, but pingers cap a request at ~30s (cron-job.org's
  // default) and record a timeout as a failed run — so awaiting made healthy
  // ticks look broken, and the retries piled more work on a busy worker.
  // Safe to detach: this host is a long-lived Node process (Render, not
  // serverless), so the promise survives the response, and runWorkerTick's
  // own busy flag already drops overlapping runs.
  void runWorkerTick().catch((error) => console.error("[cron] tick failed", error));
  return Response.json({ ok: true, started: true }, { status: 202 });
}
