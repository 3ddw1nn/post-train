import {
  siX,
  siInstagram,
  siLinkedin,
  siFacebook,
  siTiktok,
  siYoutube,
  siBluesky,
  siThreads,
  siPinterest,
  siMastodon,
  siTumblr,
} from "simple-icons";

export type PlatformId =
  | "twitter"
  | "instagram"
  | "linkedin"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "bluesky"
  | "threads"
  | "pinterest"
  | "mastodon"
  | "tumblr";

export type PostType = "text" | "image" | "video" | "story";

export type Platform = {
  id: PlatformId;
  name: string;
  slug: string; // marketing page slug
  hex: string;
  path: string; // svg path (24x24 viewBox)
  supports: PostType[];
  analytics: boolean;
  onboardingGrid: boolean;
  shareUrl: (username: string, postId: string) => string;
  note?: string; // platform caveat shown on the connections page
  noteLink?: { href: string; label: string };
};

export const PLATFORMS: Platform[] = [
  {
    id: "twitter",
    name: "Twitter/X",
    slug: "twitter-x",
    hex: "#0f1419",
    path: siX.path,
    supports: ["text", "image", "video"],
    analytics: false,
    onboardingGrid: true,
    shareUrl: (u, id) => `https://x.com/${u}/status/${id}`,
  },
  {
    id: "instagram",
    name: "Instagram",
    slug: "instagram",
    hex: `#${siInstagram.hex}`,
    path: siInstagram.path,
    supports: ["image", "video", "story"],
    analytics: true,
    onboardingGrid: true,
    shareUrl: (_u, id) => `https://www.instagram.com/p/${id}/`,
    note: "Requires a Professional (Business or Creator) account — personal accounts can't authorize posting. Switch in the Instagram app: Settings → Account type and tools → Switch to professional account.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    slug: "linkedin",
    hex: `#${siLinkedin.hex}`,
    path: siLinkedin.path,
    supports: ["text", "image", "video"],
    analytics: false,
    onboardingGrid: true,
    shareUrl: (_u, id) => `https://www.linkedin.com/feed/update/urn:li:share:${id}`,
  },
  {
    id: "facebook",
    name: "Facebook",
    slug: "facebook",
    hex: `#${siFacebook.hex}`,
    path: siFacebook.path,
    supports: ["text", "image", "video", "story"],
    analytics: false,
    onboardingGrid: true,
    shareUrl: (u, id) => `https://www.facebook.com/${u}/posts/${id}`,
    note: "Posts go to a Facebook Page, not your personal profile — Facebook removed personal timeline posting for all apps in April 2018. Any Facebook account can create a Page for free; a business account isn't required.",
    noteLink: { href: "https://www.facebook.com/pages/create", label: "Create a Facebook Page" },
  },
  {
    id: "tiktok",
    name: "TikTok",
    slug: "tiktok",
    hex: "#0f1419",
    path: siTiktok.path,
    supports: ["image", "video"],
    analytics: true,
    onboardingGrid: true,
    shareUrl: (u, id) => `https://www.tiktok.com/@${u}/video/${id}`,
  },
  {
    id: "youtube",
    name: "YouTube",
    slug: "youtube",
    hex: `#${siYoutube.hex}`,
    path: siYoutube.path,
    supports: ["image", "video"],
    analytics: true,
    onboardingGrid: true,
    shareUrl: (_u, id) => `https://www.youtube.com/shorts/${id}`,
  },
  {
    id: "bluesky",
    name: "Bluesky",
    slug: "bluesky",
    hex: `#${siBluesky.hex}`,
    path: siBluesky.path,
    supports: ["text", "image", "video"],
    analytics: false,
    onboardingGrid: true,
    shareUrl: (u, id) => `https://bsky.app/profile/${u}/post/${id}`,
  },
  {
    id: "mastodon",
    name: "Mastodon",
    slug: "mastodon",
    hex: `#${siMastodon.hex}`,
    path: siMastodon.path,
    supports: ["text", "image", "video"],
    analytics: false,
    onboardingGrid: true,
    // Real share URL comes back from the publish call itself (instance-specific);
    // this is only a fallback for the pre-connect simulated preview.
    shareUrl: (u, id) => `https://mastodon.social/@${u}/${id}`,
  },
  {
    id: "threads",
    name: "Threads",
    slug: "threads",
    hex: "#0f1419",
    path: siThreads.path,
    supports: ["text", "image", "video"],
    analytics: false,
    onboardingGrid: true,
    shareUrl: (u, id) => `https://www.threads.net/@${u}/post/${id}`,
    note: "Requires a Threads profile linked to a Professional (Business or Creator) Instagram account — personal accounts can't authorize posting.",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    slug: "pinterest",
    hex: `#${siPinterest.hex}`,
    path: siPinterest.path,
    supports: ["image", "video"],
    analytics: false,
    onboardingGrid: true,
    shareUrl: (_u, id) => `https://www.pinterest.com/pin/${id}/`,
  },
  {
    id: "tumblr",
    name: "Tumblr",
    slug: "tumblr",
    hex: `#${siTumblr.hex}`,
    path: siTumblr.path,
    supports: ["text"],
    analytics: false,
    onboardingGrid: true,
    shareUrl: (u, id) => `https://${u}.tumblr.com/post/${id}/`,
  },
];

export const platform = (id: string): Platform | undefined =>
  PLATFORMS.find((p) => p.id === id);

/** Platforms with a real OAuth connection flow. */
export function connectHref(id: PlatformId, opts: { returnTo: string; reconnect?: number; via?: "facebook" | "direct" }): string {
  const params = new URLSearchParams({ return: opts.returnTo });
  if (opts.reconnect) params.set("reconnect", String(opts.reconnect));
  if (id === "twitter") return `/api/connections/twitter/start?${params}`;
  if (id === "linkedin") return `/api/connections/linkedin/start?${params}`;
  if (id === "mastodon") return `/api/connections/mastodon/start?${params}`;
  if (id === "youtube") return `/api/connections/youtube/start?${params}`;
  if (id === "pinterest") return `/api/connections/pinterest/start?${params}`;
  if (id === "tiktok") return `/api/connections/tiktok/start?${params}`;
  if (id === "tumblr") return `/api/connections/tumblr/start?${params}`;
  if (id === "facebook") return `/api/connections/facebook/start?${params}`;
  // Instagram has two connect paths: via a linked Facebook Page (default),
  // or direct Instagram Login for accounts with no Page at all.
  if (id === "instagram") return `/api/connections/instagram${opts.via === "direct" ? "-direct" : ""}/start?${params}`;
  if (id === "threads") return `/api/connections/threads/start?${params}`;
  return `/oauth/mock/${id}?${params}`;
}

export const platformBySlug = (slug: string): Platform | undefined =>
  PLATFORMS.find((p) => p.slug === slug);

export const platformsForType = (type: PostType) =>
  PLATFORMS.filter((p) => p.supports.includes(type));

/** Platforms that only take the first 4 images of a carousel. */
export const FOUR_IMAGE_PLATFORMS: PlatformId[] = ["twitter", "bluesky", "threads", "mastodon"];

/**
 * Max images/videos supported in a single multi-image post, per each
 * platform's own docs (checked 2026): X/Bluesky/Mastodon cap at 4 (standard
 * default for Mastodon), Pinterest carousels at 5 (2-5 per Pinterest's ad
 * specs), Instagram/Threads/LinkedIn at 20, TikTok photo mode at 35 (min 4).
 * Facebook has no officially documented hard cap for Graph API multi-photo
 * posts — both intentionally omitted here.
 */
export const CAROUSEL_MAX: Partial<Record<PlatformId, number>> = {
  twitter: 4,
  bluesky: 4,
  mastodon: 4,
  pinterest: 5,
  instagram: 20,
  threads: 20,
  linkedin: 20,
  tiktok: 35,
};

export const ANALYTICS_PLATFORMS: PlatformId[] = ["tiktok", "youtube", "instagram"];

export const CAPTION_MAX = 2200;

/**
 * Each platform's own hard cap on a single post's text (checked 2026):
 * X 280, Bluesky 300, Mastodon/Threads 500, Pinterest pin description 800,
 * Instagram/TikTok 2,200, LinkedIn 3,000, Facebook 63,206.
 */
export const CAPTION_MAX_BY_PLATFORM: Partial<Record<PlatformId, number>> = {
  twitter: 280,
  bluesky: 300,
  mastodon: 500,
  threads: 500,
  pinterest: 800,
  instagram: 2200,
  tiktok: 2200,
  linkedin: 3000,
  facebook: 63206,
};

/**
 * Platforms where hashtags are a meaningful discovery mechanism, so AI
 * auto-fill should append a few. Mastodon is included deliberately — most
 * instances have no full-text search, so hashtags are often the only way a
 * post gets found. Pinterest and Facebook are excluded: both platforms'
 * own guidance favors plain descriptive text over hashtags for reach.
 */
export const HASHTAG_PLATFORMS: PlatformId[] = ["instagram", "tiktok", "threads", "twitter", "linkedin", "mastodon"];

/** Shared across the dashboard + onboarding connect pages — both are valid `return` targets after a real OAuth flow. */
export const CONNECT_ERRORS: Record<string, string> = {
  oauth_cancelled: "Connection cancelled — no account was linked.",
  plan_limit: "Your plan's connected-account limit is reached — upgrade to connect more.",
  mastodon_auth_failed: "Mastodon authorization failed or was cancelled.",
  mastodon_auth_expired: "That Mastodon session expired — try connecting again.",
  mastodon_platform_error: "Mastodon couldn't complete the connection — try again in a moment.",
  twitter_auth_failed: "Twitter/X authorization failed or was cancelled.",
  twitter_auth_expired: "That Twitter/X session expired — try connecting again.",
  twitter_platform_error: "Twitter/X couldn't complete the connection — try again in a moment.",
  linkedin_auth_failed: "LinkedIn authorization failed or was cancelled.",
  linkedin_auth_expired: "That LinkedIn session expired — try connecting again.",
  linkedin_platform_error: "LinkedIn couldn't complete the connection — try again in a moment.",
  youtube_auth_failed: "YouTube authorization failed or was cancelled.",
  youtube_auth_expired: "That YouTube session expired — try connecting again.",
  youtube_platform_error: "YouTube couldn't complete the connection — try again in a moment.",
  pinterest_auth_failed: "Pinterest authorization failed or was cancelled.",
  pinterest_auth_expired: "That Pinterest session expired — try connecting again.",
  pinterest_platform_error: "Pinterest couldn't complete the connection — try again in a moment.",
  tumblr_auth_failed: "Tumblr authorization failed or was cancelled.",
  tumblr_auth_expired: "That Tumblr session expired — try connecting again.",
  tumblr_platform_error: "Tumblr couldn't complete the connection — try again in a moment.",
  facebook_auth_failed: "Facebook authorization failed or was cancelled.",
  facebook_auth_expired: "That Facebook session expired — try connecting again.",
  facebook_platform_error: "Facebook couldn't complete the connection — try again in a moment.",
  instagram_auth_failed: "Instagram authorization failed or was cancelled.",
  instagram_auth_expired: "That Instagram session expired — try connecting again.",
  instagram_platform_error: "Instagram couldn't complete the connection — try again in a moment.",
  threads_auth_failed: "Threads authorization failed or was cancelled.",
  threads_auth_expired: "That Threads session expired — try connecting again.",
  threads_platform_error: "Threads couldn't complete the connection — try again in a moment.",
  tiktok_auth_failed: "TikTok authorization failed or was cancelled.",
  tiktok_auth_expired: "That TikTok session expired — try connecting again.",
  tiktok_platform_error: "TikTok couldn't complete the connection — try again in a moment.",
};
