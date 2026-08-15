// @ts-nocheck
// Keeps the background worker alive without depending on a third-party pinger.
//
// The worker (Render, WORKER_ENABLED=1) does the real work on its own 15s
// in-process interval — see lib/worker.ts. But Render's free tier sleeps after
// 15 minutes with no inbound traffic, and a sleeping worker publishes nothing
// and renders nothing. Something has to knock on the door.
//
// That used to be an external cron service, which turned out to be a bad place
// for load-bearing infrastructure: it silently sat disabled, and its failures
// were invisible from inside the app. Convex already runs reliably next to us,
// so it does the knocking now — versioned with the code, and nothing to
// remember to re-enable.
//
// Set WORKER_TICK_URL (full URL including ?token=) with:
//   npx convex env set WORKER_TICK_URL 'https://…/api/cron/tick?token=…'
// Unset, this no-ops rather than erroring every 5 minutes — an unconfigured
// preview deployment shouldn't spam failures.
import { cronJobs, internalActionGeneric as internalAction } from "convex/server";
import { internal } from "./_generated/api";

export const pingWorker = internalAction({
  args: {},
  handler: async () => {
    const url = process.env.WORKER_TICK_URL;
    if (!url) return { skipped: "WORKER_TICK_URL not set" };
    try {
      // The tick route answers 202 immediately and works in the background, so
      // this is a short request — but cap it anyway so a hung socket can't
      // wedge the cron.
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) console.error(`[cron] worker tick returned ${res.status}`);
      return { status: res.status };
    } catch (error) {
      // A cold-starting free instance can exceed the timeout. That request
      // still woke it, and the next run lands on a warm server, so this is
      // logged rather than thrown.
      console.error("[cron] worker ping failed", error);
      return { error: String(error) };
    }
  },
});

const crons = cronJobs();
// Comfortably under Render's 15-minute idle timeout: two consecutive failures
// still leave the service awake.
crons.interval("keep worker awake", { minutes: 5 }, internal.crons.pingWorker, {});

export default crons;
