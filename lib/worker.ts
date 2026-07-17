// In-process scheduler (stands in for a Trigger.dev/Inngest-class job runner).
// Started once from instrumentation.ts; polls due posts every 15s.
import { processDuePosts } from "./publish";

const g = globalThis as unknown as { __ptWorker?: ReturnType<typeof setInterval> };

export function startWorker() {
  if (g.__ptWorker) return;
  g.__ptWorker = setInterval(() => {
    try {
      const n = processDuePosts();
      if (n > 0) console.log(`[worker] published ${n} due post(s)`);
    } catch (e) {
      console.error("[worker] tick failed", e);
    }
  }, 15_000);
  console.log("[worker] scheduler started (15s tick)");
}
