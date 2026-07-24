// Tools registry. Dashboard-only tools can stay out of the public marketing
// surface while still being available to signed-in members.
export type ToolRegistryItem = {
  slug: string;
  name: string;
  desc: string;
  icon: string;
  public?: boolean;
};

export const DASHBOARD_TOOL_LIST: ToolRegistryItem[] = [
  {
    slug: "trend-finder",
    name: "Trend Finder",
    desc: "Find trend signals from free and connected sources before paying for vendor data.",
    icon: "search",
    public: false,
  },
  {
    slug: "instagram-grid-maker",
    name: "Instagram Grid Maker",
    desc: "Split one image into a 3-column grid for your profile.",
    icon: "grid",
    public: true,
  },
  {
    slug: "carousel-splitter",
    name: "Carousel Splitter",
    desc: "Slice a wide image into swipeable carousel panels.",
    icon: "image",
    public: true,
  },
  {
    slug: "instagram-handle-checker",
    name: "Instagram Handle Checker",
    desc: "Check formatting rules and availability for an Instagram handle.",
    icon: "check",
    public: true,
  },
  {
    slug: "tiktok-username-checker",
    name: "TikTok Username Checker",
    desc: "Validate a TikTok username against the platform's rules.",
    icon: "type",
    public: true,
  },
  {
    slug: "tiktok-caption-generator",
    name: "TikTok Caption Generator",
    desc: "Spin up hook-first caption ideas from a topic.",
    icon: "sparkles",
    public: true,
  },
  {
    slug: "linkedin-formatter",
    name: "LinkedIn Text Formatter",
    desc: "Bold and italic unicode text for LinkedIn posts.",
    icon: "pencil",
    public: true,
  },
  {
    slug: "youtube-title-checker",
    name: "YouTube Title Checker",
    desc: "Length, truncation and keyword checks for video titles.",
    icon: "eye",
    public: true,
  },
  {
    slug: "youtube-tag-generator",
    name: "YouTube Tag Generator",
    desc: "Generate a tag list from your video topic.",
    icon: "list",
    public: true,
  },
  {
    slug: "x-timeline-blocker",
    name: "X Timeline Blocker",
    desc: "CSS snippet to hide the algorithmic timeline and stay focused.",
    icon: "shield",
    public: true,
  },
  {
    slug: "hashtag-counter",
    name: "Hashtag & Character Counter",
    desc: "Live character and hashtag counts against every platform's limits.",
    icon: "chart",
    public: true,
  },
];

export const PUBLIC_TOOL_LIST = DASHBOARD_TOOL_LIST.filter((tool) => tool.public !== false);

// Backward-compatible default list for dashboard/member tools.
export const TOOL_LIST = DASHBOARD_TOOL_LIST;
