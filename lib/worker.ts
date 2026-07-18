// Job tick: publishes due posts and advances Content Studio renders. Runs
// two ways depending on host:
//  - Any always-on host (WORKER_ENABLED=1): the in-process 15s interval below,
//    started once from instrumentation.ts.
//  - Render free tier (or any host that sleeps on idle): an external pinger
//    hits GET /api/cron/tick, which calls runWorkerTick() directly — see
//    app/api/cron/tick/route.ts.
// The busy flag prevents the interval and an inbound ping from overlapping.
import { processDuePosts } from "./publish";
import { processStudioJobs } from "./studio";

const g = globalThis as unknown as {
  __ptWorker?: ReturnType<typeof setInterval>;
  __ptTickBusy?: boolean;
};

export async function runWorkerTick(): Promise<{ published: number; studioAdvanced: number }> {
  if (g.__ptTickBusy) return { published: 0, studioAdvanced: 0 };
  g.__ptTickBusy = true;
  try {
    let published = 0;
    let studioAdvanced = 0;
    try {
      published = await processDuePosts();
      if (published > 0) console.log(`[worker] published ${published} due post(s)`);
    } catch (e) {
      console.error("[worker] tick failed", e);
    }
    try {
      studioAdvanced = await processStudioJobs();
      if (studioAdvanced > 0) console.log(`[worker] advanced ${studioAdvanced} studio job(s)`);
    } catch (e) {
      console.error("[worker] studio tick failed", e);
    }
    return { published, studioAdvanced };
  } finally {
    g.__ptTickBusy = false;
  }
}

export function startWorker() {
  // Hybrid deploy: only the designated worker instance (Render, WORKER_ENABLED=1)
  // runs the interval — the Vercel app must not tick, or posts could publish
  // twice (processDuePosts has no cross-process claim, unlike studio jobs).
  // Dev keeps ticking with zero config.
  if (process.env.NODE_ENV === "production" && process.env.WORKER_ENABLED !== "1") return;
  if (g.__ptWorker) return;
  g.__ptWorker = setInterval(runWorkerTick, 15_000);
  console.log("[worker] scheduler started (15s tick)");
}
