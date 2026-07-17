// Free-tools registry (marketing SEO surface, spec 11 §12). Pure data — the
// client components live in components/tools.tsx.
export const TOOL_LIST: { slug: string; name: string; desc: string }[] = [
  {
    slug: "instagram-grid-maker",
    name: "Instagram Grid Maker",
    desc: "Split one image into a 3-column grid for your profile.",
  },
  {
    slug: "carousel-splitter",
    name: "Carousel Splitter",
    desc: "Slice a wide image into swipeable carousel panels.",
  },
  {
    slug: "instagram-handle-checker",
    name: "Instagram Handle Checker",
    desc: "Check formatting rules and availability for an Instagram handle.",
  },
  {
    slug: "tiktok-username-checker",
    name: "TikTok Username Checker",
    desc: "Validate a TikTok username against the platform's rules.",
  },
  {
    slug: "tiktok-caption-generator",
    name: "TikTok Caption Generator",
    desc: "Spin up hook-first caption ideas from a topic.",
  },
  {
    slug: "linkedin-formatter",
    name: "LinkedIn Text Formatter",
    desc: "Bold and italic unicode text for LinkedIn posts.",
  },
  {
    slug: "youtube-title-checker",
    name: "YouTube Title Checker",
    desc: "Length, truncation and keyword checks for video titles.",
  },
  {
    slug: "youtube-tag-generator",
    name: "YouTube Tag Generator",
    desc: "Generate a tag list from your video topic.",
  },
  {
    slug: "x-timeline-blocker",
    name: "X Timeline Blocker",
    desc: "CSS snippet to hide the algorithmic timeline and stay focused.",
  },
  {
    slug: "hashtag-counter",
    name: "Hashtag & Character Counter",
    desc: "Live character and hashtag counts against every platform's limits.",
  },
];
