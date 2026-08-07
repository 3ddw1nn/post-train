// Check for convex/notificationRules.ts — run with `npm run check:notifications`.
//
// Same pattern as check-media-filters.mjs. Both bugs this guards are silent
// and only show up in production:
//   1. A render leaving TWO inbox entries (rendering + ready) instead of one
//      row that changed state.
//   2. The 15s worker re-tick re-toasting an unchanged state forever, which
//      turns the toast area into a strobe light nobody can dismiss.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { decideNotification } = require("../node_modules/.cache/checks/convex/notificationRules.js");

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra && !cond ? " — " + extra : ""}`);
};

const rendering = { status: "processing", title: "Video Editor is rendering", message: "Rendering — you can leave this page.", href: "/studio" };
const ready = { status: "success", title: "Video Editor is ready", message: "Your export finished.", href: "/studio" };
const row = (content, over = {}) => ({ ...content, read_at: null, toast_shown_at: null, ...over });

/* ── First write ─────────────────────────────────────────────────────────── */

ok("no existing row -> insert", decideNotification(null, rendering).action === "insert");
ok("undefined existing -> insert", decideNotification(undefined, rendering).action === "insert");
ok("insert carries the content", decideNotification(null, ready).content.title === ready.title);

/* ── The re-tick guard: unchanged writes must do nothing ─────────────────── */

ok("identical re-write is skipped", decideNotification(row(rendering), rendering).action === "skip");
ok(
  "re-write is skipped even after the user read it",
  decideNotification(row(rendering, { read_at: "2026-01-01T00:00:00Z" }), rendering).action === "skip",
);
ok(
  "re-write is skipped even after the toast was shown",
  decideNotification(row(rendering, { toast_shown_at: "2026-01-01T00:00:00Z" }), rendering).action === "skip",
);
// A producer re-pointing the link is not news; treating it as news would
// re-toast on every worker tick.
ok(
  "href-only change does NOT re-toast",
  decideNotification(row(rendering), { ...rendering, href: "/somewhere-else" }).action === "skip",
);

/* ── The state-change path: one row, surfaced again ──────────────────────── */

const finished = decideNotification(row(rendering, { read_at: "x", toast_shown_at: "y" }), ready);
ok("rendering -> ready patches (never inserts a second row)", finished.action === "patch");
ok("state change clears read_at so it resurfaces", finished.patch.read_at === null);
ok("state change clears toast_shown_at so it re-toasts", finished.patch.toast_shown_at === null);
ok("patch carries the new status", finished.patch.status === "success");
ok("patch carries the new title", finished.patch.title === ready.title);
ok("patch carries the new href", finished.patch.href === ready.href);

/* ── Each field independently counts as a change ─────────────────────────── */

ok("status change is a change", decideNotification(row(rendering), { ...rendering, status: "error" }).action === "patch");
ok("title change is a change", decideNotification(row(rendering), { ...rendering, title: "Different" }).action === "patch");
ok("message change is a change", decideNotification(row(rendering), { ...rendering, message: "Different" }).action === "patch");

/* ── A failure must still surface after a success ────────────────────────── */

const failedAfter = decideNotification(row(ready), { status: "error", title: "Render failed", message: "Out of memory.", href: "/studio" });
ok("success -> failure patches", failedAfter.action === "patch");
ok("failure resurfaces (read cleared)", failedAfter.patch.read_at === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
