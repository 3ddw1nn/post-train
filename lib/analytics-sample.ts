// Deterministic sample analytics for the dashboard's "Preview with sample
// data" mode.
//
// This is display-only scaffolding: it never touches the database and is only
// reachable from the empty state, so a workspace with real numbers can't be
// confused by it. It exists so the charts can be reviewed (and demoed) before
// a workspace has published anything.
//
// Seeded from a fixed string rather than Math.random so the same preview
// renders every time — a chart that reshuffles on every keystroke is
// impossible to evaluate.

import { PLATFORMS } from "./platforms";

export type SampleRow = {
  id: string;
  platform: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  cover_image_url: string | null;
  share_url: string | null;
  video_description: string | null;
  duration: number | null;
  platform_created_at: string | null;
  last_synced_at: string | null;
  match_confidence: string;
  post_type: string | null;
  studio_template: string | null;
};

/** Mulberry32 — tiny seeded PRNG, so the preview is stable across renders. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAPTIONS = [
  "3 editing tricks that doubled my watch time",
  "Behind the scenes of a 12-hour shoot day",
  "The one hook format that never flops",
  "Answering your most-asked question",
  "How I batch a month of content in a weekend",
  "Rating your setups (part 4)",
  "This took 40 takes and I'm not okay",
  "The tool I wish I'd found a year ago",
  "Day in the life: launch week",
  "Why your first 3 seconds are everything",
  "Unfiltered thoughts on the new algorithm",
  "A tiny change that tripled saves",
];

const TYPES = ["video", "image", "text", "story"];
const TEMPLATES = ["grid-2x2", "fade-in", "ai-ugc", "slideshow", "thumbnail", null];

/** Platforms weighted so the preview looks like a real account — a few
 *  primary channels, a long tail, and a couple never used. */
const WEIGHT: Record<string, number> = {
  tiktok: 1,
  instagram: 0.95,
  youtube: 0.8,
  twitter: 0.55,
  linkedin: 0.45,
  facebook: 0.4,
  threads: 0.3,
  pinterest: 0.22,
  bluesky: 0.15,
  mastodon: 0.07,
  tumblr: 0,
};

export function sampleAnalytics(now: Date = new Date()): SampleRow[] {
  const random = rng(20260806);
  const rows: SampleRow[] = [];
  let n = 0;

  for (const { id: platform } of PLATFORMS) {
    const weight = WEIGHT[platform] ?? 0.2;
    const count = Math.round(weight * 26);
    for (let i = 0; i < count; i++) {
      const daysBack = Math.floor(random() * 88);
      const at = new Date(now);
      at.setDate(at.getDate() - daysBack);
      // Posting hours cluster in the late morning and evening, with the
      // occasional outlier — otherwise the timing heatmap is a flat wash.
      const slot = random();
      const hour = slot < 0.42 ? 9 + Math.floor(random() * 4)
        : slot < 0.84 ? 17 + Math.floor(random() * 5)
        : Math.floor(random() * 24);
      at.setHours(hour, Math.floor(random() * 60), 0, 0);

      // A few posts pop far above the rest, like a real feed.
      const viral = random() < 0.08 ? 6 + random() * 9 : 1;
      const views = Math.round((300 + random() * 5200) * weight * viral + 40);
      const likeRate = 0.03 + random() * 0.06;
      const likes = Math.round(views * likeRate);

      rows.push({
        id: `sample-${n++}`,
        platform,
        view_count: views,
        like_count: likes,
        comment_count: Math.round(likes * (0.05 + random() * 0.14)),
        share_count: Math.round(likes * (0.07 + random() * 0.2)),
        cover_image_url: null,
        share_url: null,
        video_description: CAPTIONS[Math.floor(random() * CAPTIONS.length)],
        duration: 15 + Math.floor(random() * 90),
        platform_created_at: at.toISOString(),
        last_synced_at: now.toISOString(),
        match_confidence: "exact",
        post_type: TYPES[Math.floor(random() * TYPES.length)],
        studio_template: TEMPLATES[Math.floor(random() * TEMPLATES.length)],
      });
    }
  }
  return rows;
}
