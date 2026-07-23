#!/usr/bin/env node
// One-off seed script for the Explore feature — NOT a permanent npm script,
// run manually once. Generates flat-color placeholder JPGs (no scraped or
// otherwise real creator content), uploads them to R2, then calls the
// explore:seedSampleItems Convex mutation with original/fabricated sample
// posts. Swap this out later for a real ingestion source — the UI only
// ever reads structured fields off explore_items/explore_item_slides.
//
// Usage: node --env-file=.env.local scripts/seed-explore.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — run with: node --env-file=.env.local scripts/seed-explore.mjs`);
  return v;
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  },
});
const bucket = required("R2_BUCKET");
const publicBase = required("R2_PUBLIC_BASE_URL").replace(/\/$/, "");

// Mirrors exploreObjectKey() in lib/r2.ts.
function exploreObjectKey(itemId, slideIndex) {
  return `explore/${itemId}/slide-${slideIndex}.jpg`;
}

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (c) => Math.min(255, Math.max(0, Math.round(c * factor)));
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pt-explore-seed-"));

function makePlaceholderJpg(hex) {
  const out = path.join(tmpDir, `${Math.random().toString(36).slice(2)}.jpg`);
  execFileSync(process.env.FFMPEG_PATH ?? "ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=${hex}:s=1080x1350`,
    "-frames:v", "1", out,
  ]);
  return out;
}

async function uploadPlaceholder(itemId, slideIndex, hex) {
  const file = makePlaceholderJpg(hex);
  const key = exploreObjectKey(itemId, slideIndex);
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: readFileSync(file),
      ContentType: "image/jpeg",
    })
  );
  return `${publicBase}/${key}`;
}

// --- sample content: original/fabricated, not copied from any real post ---
const CATEGORY_COLOR = {
  "Health & Wellness": "#22c55e",
  Technology: "#3b82f6",
  Travel: "#f59e0b",
  Finance: "#8b5cf6",
  Beauty: "#ec4899",
};

const ITEMS = [
  { category: "Health & Wellness", platform: "instagram", media_type: "slideshow",
    caption: "5 morning habits that actually changed my energy levels",
    slideTexts: ["Habit 1: Light before caffeine", "Habit 2: 10 min walk, no phone", "Habit 3: Protein within an hour", "Habit 4: Cold water on your face"],
    hashtags: ["morningroutine", "wellness", "energy"], views: 18400, likes: 612, comments: 41, shares: 88, saves: 340, monetized: 0 },
  { category: "Health & Wellness", platform: "tiktok", media_type: "video",
    caption: "I tried cold plunges for 30 days — here's what happened",
    slideTexts: ["Day 1 vs Day 30"],
    hashtags: ["coldplunge", "30daychallenge"], views: 52100, likes: 3400, comments: 210, shares: 540, saves: 890, monetized: 1 },
  { category: "Health & Wellness", platform: "instagram", media_type: "slideshow",
    caption: "The stretch routine physical therapists actually recommend",
    slideTexts: ["Stretch 1: Hip flexor", "Stretch 2: Thoracic rotation", "Stretch 3: Hamstring floss"],
    hashtags: ["mobility", "physicaltherapy"], views: 9800, likes: 401, comments: 22, shares: 65, saves: 512, monetized: 0 },

  { category: "Technology", platform: "tiktok", media_type: "slideshow",
    caption: "This keyboard shortcut saved me 10 hours a week",
    slideTexts: ["The problem", "The shortcut", "Before", "After"],
    hashtags: ["productivity", "techtips"], views: 24300, likes: 1900, comments: 88, shares: 410, saves: 1200, monetized: 0 },
  { category: "Technology", platform: "tiktok", media_type: "video",
    caption: "Unboxing the gadget everyone's talking about",
    slideTexts: ["Unboxing"],
    hashtags: ["unboxing", "tech"], views: 61000, likes: 4200, comments: 305, shares: 720, saves: 640, monetized: 1 },
  { category: "Technology", platform: "instagram", media_type: "slideshow",
    caption: "3 apps I deleted that made my phone so much better",
    slideTexts: ["App 1", "App 2", "App 3"],
    hashtags: ["digitalminimalism", "phonesetup"], views: 13500, likes: 780, comments: 54, shares: 190, saves: 430, monetized: 0 },
  { category: "Technology", platform: "instagram", media_type: "slideshow",
    caption: "The productivity setup that finally stuck",
    slideTexts: ["The desk", "The system", "The result"],
    hashtags: ["desksetup", "productivity"], views: 8700, likes: 320, comments: 19, shares: 44, saves: 260, monetized: 0 },

  { category: "Travel", platform: "instagram", media_type: "slideshow",
    caption: "Signs you found your ride-or-die travel group",
    slideTexts: ["The planner", "The photographer", "The one who's always late", "The one who saves the trip"],
    hashtags: ["traveltok", "friendtrip"], views: 14100, likes: 890, comments: 34, shares: 105, saves: 180, monetized: 0 },
  { category: "Travel", platform: "tiktok", media_type: "video",
    caption: "Pack light or regret it: my 5-day carry-on system",
    slideTexts: ["Carry-on tour"],
    hashtags: ["packing", "traveltips"], views: 33200, likes: 2100, comments: 130, shares: 380, saves: 990, monetized: 0 },
  { category: "Travel", platform: "instagram", media_type: "slideshow",
    caption: "Hidden viewpoint locals don't post about",
    slideTexts: ["The walk up", "The view", "Golden hour"],
    hashtags: ["hiddengem", "traveltok"], views: 21700, likes: 1500, comments: 76, shares: 240, saves: 610, monetized: 1 },

  { category: "Finance", platform: "tiktok", media_type: "slideshow",
    caption: "The budgeting method that finally stuck",
    slideTexts: ["The old way", "The new system", "Week 1 results", "Month 1 results"],
    hashtags: ["budgeting", "personalfinance"], views: 27600, likes: 2200, comments: 160, shares: 510, saves: 1400, monetized: 1 },
  { category: "Finance", platform: "tiktok", media_type: "video",
    caption: "3 subscriptions I cancelled that saved me $600/year",
    slideTexts: ["The audit"],
    hashtags: ["moneytips", "savemoney"], views: 41800, likes: 3100, comments: 240, shares: 690, saves: 1100, monetized: 0 },
  { category: "Finance", platform: "instagram", media_type: "slideshow",
    caption: "How I paid off debt without giving up coffee",
    slideTexts: ["The plan", "The tracker", "The payoff"],
    hashtags: ["debtfree", "moneytok"], views: 16900, likes: 1050, comments: 62, shares: 145, saves: 730, monetized: 0 },

  { category: "Beauty", platform: "instagram", media_type: "slideshow",
    caption: "Skincare order everyone gets wrong",
    slideTexts: ["Step 1: Cleanse", "Step 2: Treat", "Step 3: Moisturize", "Step 4: SPF", "Common mistake"],
    hashtags: ["skincare", "skincareroutine"], views: 38500, likes: 2900, comments: 190, shares: 480, saves: 1600, monetized: 1 },
  { category: "Beauty", platform: "tiktok", media_type: "video",
    caption: "Get ready with me for a job interview",
    slideTexts: ["GRWM"],
    hashtags: ["grwm", "interviewready"], views: 22300, likes: 1700, comments: 95, shares: 210, saves: 380, monetized: 0 },
  { category: "Beauty", platform: "instagram", media_type: "slideshow",
    caption: "Drugstore dupes that outperform the originals",
    slideTexts: ["Dupe 1", "Dupe 2", "Dupe 3"],
    hashtags: ["drugstoremakeup", "dupes"], views: 19200, likes: 1400, comments: 88, shares: 260, saves: 940, monetized: 0 },
];

const HANDLES = [
  "dailyreset.jenna", "techwithmarcus", "wanderwithava", "budgetwithb", "glowbyrenee",
  "coldplungechris", "mobilitywithmaya", "shortcutsam", "unboxwithzo", "minimalmiles",
  "carryonkat", "hiddenspotshelby", "debtfreedana", "grwmwithgabby", "dupequeend", "deskbydevon",
];

async function main() {
  const items = [];
  for (let i = 0; i < ITEMS.length; i++) {
    const src = ITEMS[i];
    const id = `xpl_seed_${i + 1}`;
    const baseColor = CATEGORY_COLOR[src.category];
    const slides = [];
    for (let s = 0; s < src.slideTexts.length; s++) {
      const factor = Math.max(0.55, 1 - s * 0.12); // subtle shade variation per slide
      const url = await uploadPlaceholder(id, s, shade(baseColor, factor));
      slides.push({ image_url: url, text: src.slideTexts[s] });
    }
    const daysAgo = 3 + i * 4;
    items.push({
      id,
      platform: src.platform,
      category: src.category,
      media_type: src.media_type,
      cover_image_url: slides[0].image_url,
      slides,
      caption: src.caption,
      hashtags: src.hashtags,
      creator_handle: HANDLES[i % HANDLES.length],
      creator_avatar_url: null,
      source_url: "#",
      view_count: src.views,
      like_count: src.likes,
      comment_count: src.comments,
      share_count: src.shares,
      save_count: src.saves,
      is_monetized: src.monetized,
      posted_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    });
    console.log(`Prepared ${id} (${src.category}, ${slides.length} slide${slides.length > 1 ? "s" : ""})`);
  }

  const client = new ConvexHttpClient(required("NEXT_PUBLIC_CONVEX_URL"));
  const result = await client.mutation(anyApi.explore.seedSampleItems, { items });
  console.log("Seed result:", result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
