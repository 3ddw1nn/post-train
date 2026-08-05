// The Growth Playbook. Same content-as-data model as the API reference, so
// this page also renders to Markdown at /growth-playbook.md.
//
// Editorial rule for this file: every claim is either a mechanic of the product
// or a mechanic of the platforms. No invented statistics, no "3x your reach" —
// a playbook that overpromises stops being useful the first time it's wrong.
import { toMarkdown, type DocGroup } from "./types";
import {
  PLATFORMS,
  CAPTION_MAX_BY_PLATFORM,
  CAROUSEL_MAX,
  HASHTAG_PLATFORMS,
  type PlatformId,
} from "../platforms";

/**
 * Built from the same constants the composer enforces, so the table can never
 * drift from what the app will actually let you publish.
 */
function platformLimitRows(): string[][] {
  return PLATFORMS.filter((p) => CAPTION_MAX_BY_PLATFORM[p.id] !== undefined).map((p) => {
    const carousel = CAROUSEL_MAX[p.id as PlatformId];
    return [
      p.name,
      CAPTION_MAX_BY_PLATFORM[p.id]!.toLocaleString(),
      carousel ? `${carousel}` : "—",
      HASHTAG_PLATFORMS.includes(p.id) ? "Yes" : "No",
    ];
  });
}

export const PLAYBOOK: DocGroup[] = [
  {
    id: "foundation",
    title: "Set up once",
    sections: [
      {
        id: "one-asset",
        title: "Pick platforms that share an asset",
        blocks: [
          {
            kind: "prose",
            text: "The cheapest growth lever isn't posting more — it's making one thing count more than once. A single vertical video is native on TikTok, Reels, Shorts, Facebook, and Pinterest. That's five surfaces for one edit, and it's why short-form video is the format worth building a habit around.",
          },
          {
            kind: "prose",
            text: "Start with the platforms that share a format, not the ones with the biggest audience. Adding a sixth platform that needs its own asset costs more than adding three that accept the one you already made.",
          },
          {
            kind: "table",
            headers: ["If you make…", "It natively fits"],
            rows: [
              ["One vertical video", "TikTok, Instagram, YouTube, Facebook, Pinterest"],
              ["One image carousel", "Instagram, TikTok, LinkedIn, Threads, Pinterest"],
              ["One piece of writing", "X, LinkedIn, Threads, Bluesky, Mastodon, Tumblr"],
            ],
          },
          {
            kind: "action",
            label: "Connect your accounts",
            href: "/dashboard/connections",
            desc: "Eleven platforms, one sitting",
          },
        ],
      },
      {
        id: "cadence",
        title: "Choose a cadence you can survive",
        blocks: [
          {
            kind: "prose",
            text: "Three posts a week you actually ship beats a daily plan you abandon by Thursday. Consistency is what every recommendation algorithm rewards, and it's the only variable fully under your control.",
          },
          {
            kind: "prose",
            text: "Set a weekly goal and let the reminder emails carry the discipline instead of your memory. Pick a number you'd still hit in a bad week — you can always post more than the goal, and a streak you keep is worth more than a target you miss.",
          },
          {
            kind: "action",
            label: "Set your weekly goal",
            href: "/dashboard/settings",
            desc: "Plus reminder emails when you're behind",
          },
        ],
      },
      {
        id: "queue",
        title: "Build the queue, then stop deciding",
        blocks: [
          {
            kind: "prose",
            text: "Queue slots are recurring times you define once — Tuesday 9am, Thursday 6pm, Sunday noon. After that you never pick a datetime again: you add content to the queue and it fills the next open slot.",
          },
          {
            kind: "prose",
            text: "This matters more than it sounds. Choosing a publish time for every post is a small decision that repeats hundreds of times, and it's usually the thing that quietly ends a posting habit. Fixed times are still there when a post is genuinely time-sensitive — a launch, an event, a reply to something happening now.",
          },
          {
            kind: "note",
            tone: "info",
            text: "Set slightly more slots than your weekly goal. An empty slot costs nothing, but a full queue with nowhere to put today's idea means it gets posted manually or not at all.",
          },
        ],
      },
    ],
  },
  {
    id: "loop",
    title: "The weekly loop",
    sections: [
      {
        id: "batch",
        title: "Batch creation, automate distribution",
        blocks: [
          {
            kind: "prose",
            text: "Creation is craft and distribution is logistics — the mistake is doing them in the same session. Record or design in one sitting while you're in the mode for it, then bulk-upload and let the queue spread everything across the week.",
          },
          {
            kind: "prose",
            text: "One two-hour block on Sunday reliably produces more than five interrupted twenty-minute sessions, because most of the cost of creating is getting started.",
          },
          {
            kind: "action",
            label: "Bulk upload a batch",
            href: "/dashboard/batch-scheduler",
            desc: "Drop in a folder, schedule the lot",
          },
        ],
      },
      {
        id: "adapt",
        title: "Same asset, native voice",
        blocks: [
          {
            kind: "prose",
            text: "Cross-posting fails when it's obviously cross-posted: a LinkedIn post full of Instagram hashtags, a caption cut off mid-sentence on X. Keep the asset identical and change the words around it.",
          },
          {
            kind: "prose",
            text: "Post Train takes a shared caption plus per-platform overrides, so you write once and adjust only where it matters. The composer enforces these limits as you type:",
          },
          {
            kind: "table",
            headers: ["Platform", "Caption limit", "Carousel max", "Hashtags help"],
            rows: platformLimitRows(),
          },
          {
            kind: "note",
            tone: "info",
            text: "Hashtags are a discovery mechanism on some platforms and noise on others. Mastodon is on the yes list for a non-obvious reason: most instances have no full-text search, so a hashtag is often the only way a post gets found at all.",
          },
        ],
      },
      {
        id: "ship",
        title: "Ship it, then leave it alone",
        blocks: [
          {
            kind: "prose",
            text: "Refreshing a post in its first hour tells you nothing. Early numbers mostly measure how many of your existing followers happened to be online, not whether the content works.",
          },
          {
            kind: "prose",
            text: "If a platform needs a human touch before it goes out — TikTok covers are the usual one — publish to drafts there and finish in the native app on your own schedule. Everything else goes out untouched.",
          },
        ],
      },
    ],
  },
  {
    id: "leverage",
    title: "Make more, faster",
    sections: [
      {
        id: "studio",
        title: "Let the Studio do the repetitive edits",
        blocks: [
          {
            kind: "prose",
            text: "Most content work isn't creative — it's the same crop, the same caption card, the same four-up grid, over and over. The Content Studio ships four templates that each collapse a recurring edit into one render.",
          },
          {
            kind: "table",
            headers: ["Template", "Turns this into that"],
            rows: [
              ["Grid 2×2", "Four clips → one 1080×1920 vertical video"],
              ["Fade-in", "One clip + a caption → a captioned vertical cut"],
              ["Slideshow", "A set of images → a paced, posted-ready sequence"],
              ["AI UGC", "A script → a talking-head video with a stock or custom persona"],
            ],
          },
          {
            kind: "prose",
            text: "Grid, fade-in, and slideshow render locally and are uncapped. AI UGC calls a paid provider and is capped at 30 generations a month per workspace.",
          },
          {
            kind: "action",
            label: "Open Content Studio",
            href: "/dashboard/content-studio",
          },
        ],
      },
      {
        id: "thumbnails",
        title: "The thumbnail is the post",
        blocks: [
          {
            kind: "prose",
            text: "On YouTube and Pinterest the thumbnail does more work than the content behind it — it's the entire pitch, and it's what determines whether anyone sees the thing you spent hours on.",
          },
          {
            kind: "prose",
            text: "Make two or three per video and pick rather than settling for the first. The variant you'd click yourself is usually not the one you made first.",
          },
          {
            kind: "action",
            label: "Generate thumbnails",
            href: "/dashboard/content-studio",
            desc: "Presets sized per platform",
          },
        ],
      },
      {
        id: "borrow",
        title: "Start from what already works",
        blocks: [
          {
            kind: "prose",
            text: "A blank editor is the most expensive place to start. Explore surfaces formats that are currently performing in your space, and you can pull any public Instagram or TikTok post in as a starting structure — the hook shape, the pacing, the number of slides.",
          },
          {
            kind: "note",
            tone: "warn",
            text: "Borrow the structure, not the content. A format is a reusable container; a copy of someone's actual post is both obvious to your audience and a fast route to a platform strike.",
          },
          { kind: "action", label: "Browse Explore", href: "/dashboard/explore" },
        ],
      },
    ],
  },
  {
    id: "compound",
    title: "Compound it",
    sections: [
      {
        id: "measure",
        title: "Read analytics weekly, not hourly",
        blocks: [
          {
            kind: "prose",
            text: "Check once a week and look at the top 20% of your posts. You're not looking for which post won — you're looking for what the winners have in common. Format, hook, length, topic, time of day: whichever of those repeats is your signal.",
          },
          {
            kind: "prose",
            text: "Ignore single-post spikes. One video outperforming by 10× is usually a distribution accident, not a repeatable insight, and chasing it costs you the cadence that actually compounds.",
          },
          {
            kind: "action",
            label: "Open analytics",
            href: "/dashboard/analytics",
            desc: "TikTok, YouTube, and Instagram",
          },
        ],
      },
      {
        id: "iterate",
        title: "Turn the signal into next week's batch",
        blocks: [
          {
            kind: "prose",
            text: "The loop only closes if what you learn on Sunday changes what you make the following Sunday. Keep the ratio roughly three to one: three posts in a format you know works, one experiment.",
          },
          {
            kind: "prose",
            text: "That ratio matters in both directions. All proven formats and you plateau; all experiments and you never build the consistency that makes any of them land.",
          },
        ],
      },
      {
        id: "automate",
        title: "Automate the parts that repeat",
        blocks: [
          {
            kind: "prose",
            text: "Once the loop is stable, the mechanical parts can run without you. Every paid plan includes a REST API and an MCP server, so you can wire scheduling into whatever already produces your content.",
          },
          {
            kind: "table",
            headers: ["Instead of", "Do this"],
            rows: [
              ["Uploading each render by hand", "POST the file URL from your render pipeline"],
              ["Copying analytics into a sheet", "Pull metrics on a cron and chart them yourself"],
              ["Opening the composer to schedule", "Ask Claude to queue it, over MCP"],
            ],
          },
          {
            kind: "action",
            label: "Read the API & MCP docs",
            href: "/docs/api",
            desc: "Included with every paid plan",
          },
        ],
      },
    ],
  },
  {
    id: "start",
    title: "Your first 30 days",
    sections: [
      {
        id: "thirty-days",
        title: "A plan you can actually follow",
        blocks: [
          {
            kind: "prose",
            text: "If you do nothing else in this playbook, do this. It's ordered so that each week only asks for something the previous week made easy.",
          },
          {
            kind: "steps",
            items: [
              {
                title: "Week 1 — Connect and commit",
                body: "Connect the platforms that share one asset. Set a weekly goal you'd hit on a bad week, and create queue slots to match. Publish two posts manually to see the flow end to end.",
              },
              {
                title: "Week 2 — Batch once",
                body: "Block two hours and make a week of content in one sitting. Bulk-upload it, let the queue schedule it, and don't open the app again until Sunday.",
              },
              {
                title: "Week 3 — Adapt and expand",
                body: "Add per-platform captions to what you're already posting. Add one more platform that accepts your existing asset. Try one Studio template on a batch you've already shot.",
              },
              {
                title: "Week 4 — Read and adjust",
                body: "Open analytics for the first time. Find what your top posts share, and make next week's batch three of that plus one experiment. That's the loop — everything after this is repetition.",
              },
            ],
          },
        ],
      },
    ],
  },
];

export const playbookToMarkdown = () =>
  toMarkdown(PLAYBOOK, "The Post Train Growth Playbook", [
    "How to grow social accounts without burning out — the operating rhythm,",
    "and how Post Train supports each part of it.",
  ]);
