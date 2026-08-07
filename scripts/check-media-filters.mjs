// Check for lib/media-filters.ts — run with `npm run check:filters`.
//
// The repo has no test runner and this doesn't add one: the npm script compiles
// the (dependency-free) filter module with the TypeScript already installed and
// runs these assertions on the output. Plain node, no new packages.
//
// What it's really guarding: facet counts that disagree with what the grid
// renders, and the studio_platform_id / studio_platform_ids precedence — a
// union there makes a TikTok export claim it was made for Instagram.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const F = require("../node_modules/.cache/checks/lib/media-filters.js");
let pass = 0, fail = 0;
const ok = (label, cond, extra="") => { cond ? pass++ : fail++; console.log(`${cond?"PASS":"FAIL"}  ${label}${extra&&!cond?" — "+extra:""}`); };

// Fixtures modelled on the real shapes: a Slideshow slide has platform_ids but
// a NULL singular; a per-destination video render has both; an upload has neither.
const slide   = { kind:"image", studio_template:"slideshow", studio_platform_ids:["instagram","tiktok"], studio_platform_id:null };
const igReel  = { kind:"video", studio_template:"grid-2x2", studio_platform_ids:["instagram","tiktok"], studio_platform_id:"instagram" };
const ttReel  = { kind:"video", studio_template:"grid-2x2", studio_platform_ids:["instagram","tiktok"], studio_platform_id:"tiktok" };
const liOnly  = { kind:"video", studio_template:"fade-in",  studio_platform_ids:["linkedin"] };
const upload  = { kind:"image" };
const all = [slide, igReel, ttReel, liOnly, upload];

// platformIdsFor: the singular must be merged in, and null must not leak
ok("per-output singular wins over batch array", JSON.stringify(F.platformIdsFor(igReel)) === '["instagram"]', JSON.stringify(F.platformIdsFor(igReel)));
ok("sibling export claims only ITS destination", JSON.stringify(F.platformIdsFor(ttReel)) === '["tiktok"]', JSON.stringify(F.platformIdsFor(ttReel)));
ok("null singular does not leak into list", JSON.stringify(F.platformIdsFor(slide)) === '["instagram","tiktok"]', JSON.stringify(F.platformIdsFor(slide)));
ok("upload has no platforms", F.platformIdsFor(upload).length === 0);
ok("missing singular field is fine", JSON.stringify(F.platformIdsFor(liOnly)) === '["linkedin"]');

// applyMediaFilter
const f = (o) => ({ ...F.EMPTY_FILTER, ...o });
ok("empty filter returns everything", F.applyMediaFilter(all, f({})).length === 5);
ok("type=video narrows to 3", F.applyMediaFilter(all, f({type:"video"})).length === 3);
ok("type=image narrows to 2", F.applyMediaFilter(all, f({type:"image"})).length === 2);
ok("platform=linkedin narrows to 1", F.applyMediaFilter(all, f({platform:"linkedin"})).length === 1);
ok("platform matches via singular-only path", F.applyMediaFilter([igReel], f({platform:"instagram"})).length === 1);
ok("slide falls back to array when singular is null", F.applyMediaFilter([slide], f({platform:"tiktok"})).length === 1);
ok("instagram filter does NOT surface the tiktok export", F.applyMediaFilter([ttReel], f({platform:"instagram"})).length === 0);
ok("upload excluded by any platform filter", F.applyMediaFilter([upload], f({platform:"instagram"})).length === 0);
ok("template filter works", F.applyMediaFilter(all, f({template:"grid-2x2"})).length === 2);
ok("filters compose (video + instagram)", F.applyMediaFilter(all, f({type:"video", platform:"instagram"})).length === 1);
ok("impossible combo yields none", F.applyMediaFilter(all, f({type:"image", platform:"linkedin"})).length === 0);

// facetCounts: the important property is that counts reflect what you'd GET,
// i.e. each facet is counted with itself excluded from the filter.
const c1 = F.facetCounts(all, f({}));
ok("type counts unfiltered", c1.type.all===5 && c1.type.video===3 && c1.type.image===2, JSON.stringify(c1.type));
ok("platform counts tally per id", c1.platform.instagram===2 && c1.platform.tiktok===2 && c1.platform.linkedin===1, JSON.stringify(c1.platform));

const c2 = F.facetCounts(all, f({type:"video"}));
ok("platform counts respect active type filter", c2.platform.instagram===1 && c2.platform.linkedin===1, JSON.stringify(c2.platform));
ok("type counts ignore their OWN filter (else tabs freeze)", c2.type.all===5 && c2.type.image===2, JSON.stringify(c2.type));

const c3 = F.facetCounts(all, f({platform:"linkedin"}));
ok("type counts respect active platform filter", c3.type.all===1 && c3.type.video===1 && c3.type.image===0, JSON.stringify(c3.type));
ok("platform counts ignore their OWN filter", c3.platform.instagram===2, JSON.stringify(c3.platform));

// The bug this guards: a facet count promising N while the grid renders 0.
for (const p of ["instagram","tiktok","linkedin"]) {
  const shown = F.applyMediaFilter(all, f({platform:p})).length;
  ok(`count for ${p} equals rendered rows`, c1.platform[p] === shown, `count=${c1.platform[p]} rendered=${shown}`);
}
for (const t of ["all","video","image"]) {
  const shown = F.applyMediaFilter(all, f({type:t})).length;
  ok(`count for type=${t} equals rendered rows`, c1.type[t] === shown, `count=${c1.type[t]} rendered=${shown}`);
}
ok("platformsPresent lists each once", JSON.stringify(F.platformsPresent(all)) === '["instagram","tiktok","linkedin"]', JSON.stringify(F.platformsPresent(all)));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
