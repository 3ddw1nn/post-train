// Check for lib/platform-aspect.ts — run with `npm run check:aspect`.
//
// Same pattern as check-media-filters.mjs. What it's really guarding: false
// warnings. A red "this doesn't fit" on a file that's fine is worse than no
// warning at all — people stop reading them — so the rules that must hold are
// "unknown never fails" and "the badge and the warning always agree".
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const A = require("../node_modules/.cache/checks/lib/platform-aspect.js");

let pass = 0, fail = 0;
const ok = (label, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra && !cond ? " — " + extra : ""}`);
};

/* ── The derived table matches the preset targets ────────────────────────── */

ok("TikTok accepts 9:16", A.PLATFORM_ASPECTS.tiktok?.includes("9:16") === true);
ok("TikTok does NOT accept 16:9", A.PLATFORM_ASPECTS.tiktok?.includes("16:9") !== true);
ok("YouTube accepts both 16:9 and 9:16 (Shorts)",
  A.PLATFORM_ASPECTS.youtube?.includes("16:9") && A.PLATFORM_ASPECTS.youtube?.includes("9:16"));
ok("Pinterest accepts 2:3", A.PLATFORM_ASPECTS.pinterest?.includes("2:3") === true);
ok("Tumblr declares no constraint", A.PLATFORM_ASPECTS.tumblr === undefined);
ok("no duplicate aspects in any list",
  Object.values(A.PLATFORM_ASPECTS).every((list) => new Set(list).size === list.length));

/* ── nearestAspectId: agrees with the Library badge ──────────────────────── */

ok("1080x1920 is 9:16", A.nearestAspectId(1080, 1920) === "9:16");
ok("1920x1080 is 16:9", A.nearestAspectId(1920, 1080) === "16:9");
ok("1080x1080 is 1:1", A.nearestAspectId(1080, 1080) === "1:1");
ok("1080x1350 is 4:5", A.nearestAspectId(1080, 1350) === "4:5");
ok("1000x1500 is 2:3", A.nearestAspectId(1000, 1500) === "2:3");
// Slightly off-spec exports still read as their intended ratio.
ok("1082x1918 still reads 9:16", A.nearestAspectId(1082, 1918) === "9:16");
// A genuinely odd ratio matches nothing rather than snapping to the nearest.
ok("640x480 (4:3) matches no standard aspect", A.nearestAspectId(640, 480) === null,
  String(A.nearestAspectId(640, 480)));
ok("missing dimensions -> null", A.nearestAspectId(null, null) === null && A.nearestAspectId(0, 0) === null);

/* ── checkPlatformAspect: unknown never fails ────────────────────────────── */

const vertical = { width: 1080, height: 1920 };
const landscape = { width: 1920, height: 1080 };

ok("vertical fits TikTok", A.checkPlatformAspect(vertical, "tiktok").ok === true);
ok("landscape does NOT fit TikTok", A.checkPlatformAspect(landscape, "tiktok").ok === false);
ok("landscape fits YouTube", A.checkPlatformAspect(landscape, "youtube").ok === true);
ok("failure reports what IS accepted",
  A.checkPlatformAspect(landscape, "tiktok").supported.includes("9:16"));
ok("failure reports the offending aspect",
  A.checkPlatformAspect(landscape, "tiktok").aspect === "16:9");

// The three ways "we don't know" can arise — none may produce a warning.
ok("no dimensions never warns", A.checkPlatformAspect({}, "tiktok").ok === true);
ok("unmapped platform never warns", A.checkPlatformAspect(landscape, "tumblr").ok === true);
ok("unknown platform id never warns", A.checkPlatformAspect(landscape, "myspace").ok === true);
ok("non-standard ratio never warns", A.checkPlatformAspect({ width: 640, height: 480 }, "tiktok").ok === true);

// A Studio export states its own ratio and that wins over its pixels.
ok("studio_aspect_ratio overrides measured pixels",
  A.checkPlatformAspect({ width: 1920, height: 1080, studio_aspect_ratio: "9:16" }, "tiktok").ok === true);
ok("a bogus studio_aspect_ratio falls back to pixels",
  A.checkPlatformAspect({ width: 1920, height: 1080, studio_aspect_ratio: "banana" }, "tiktok").ok === false);

/* ── formatAspectList ────────────────────────────────────────────────────── */

ok("one item", A.formatAspectList(["9:16"]) === "9:16");
ok("two items", A.formatAspectList(["9:16", "1:1"]) === "9:16 and 1:1");
ok("three items", A.formatAspectList(["4:5", "1:1", "16:9"]) === "4:5, 1:1 and 16:9");
ok("empty list", A.formatAspectList([]) === "");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
