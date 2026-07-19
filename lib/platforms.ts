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
  siGoogle,
  siMastodon,
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
  | "google_business"
  | "mastodon";

export type PostType = "text" | "image" | "video" | "story";

export type Platform = {
  id: PlatformId;
  name: string;
  slug: string; // marketing page slug
  hex: string;
  path: string; // svg path (24x24 viewBox)
  supports: PostType[];
  analytics: boolean;
  onboardingGrid: boolean; // Google Business is absent from the onboarding picker
  shareUrl: (username: string, postId: string) => string;
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
    supports: ["video"],
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
    id: "google_business",
    name: "Google Business",
    slug: "google-business",
    hex: `#${siGoogle.hex}`,
    path: siGoogle.path,
    supports: ["text", "image", "video"],
    analytics: false,
    onboardingGrid: false,
    shareUrl: (_u, id) => `https://business.google.com/posts/l/${id}`,
  },
];

export const platform = (id: string): Platform | undefined =>
  PLATFORMS.find((p) => p.id === id);

/** Twitter/LinkedIn/Mastodon/YouTube use a real OAuth 2.0 redirect flow; everything else still uses the mock consent screen. */
export function connectHref(id: PlatformId, opts: { returnTo: string; reconnect?: number }): string {
  const params = new URLSearchParams({ return: opts.returnTo });
  if (opts.reconnect) params.set("reconnect", String(opts.reconnect));
  if (id === "twitter") return `/api/connections/twitter/start?${params}`;
  if (id === "linkedin") return `/api/connections/linkedin/start?${params}`;
  if (id === "mastodon") return `/api/connections/mastodon/start?${params}`;
  if (id === "youtube") return `/api/connections/youtube/start?${params}`;
  return `/oauth/mock/${id}?${params}`;
}

export const platformBySlug = (slug: string): Platform | undefined =>
  PLATFORMS.find((p) => p.slug === slug);

export const platformsForType = (type: PostType) =>
  PLATFORMS.filter((p) => p.supports.includes(type));

/** Platforms that only take the first 4 images of a carousel. */
export const FOUR_IMAGE_PLATFORMS: PlatformId[] = ["twitter", "bluesky", "threads", "mastodon"];

export const ANALYTICS_PLATFORMS: PlatformId[] = ["tiktok", "youtube", "instagram"];

export const CAPTION_MAX = 2200;

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
};
