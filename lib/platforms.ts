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
  | "google_business";

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

export const platformBySlug = (slug: string): Platform | undefined =>
  PLATFORMS.find((p) => p.slug === slug);

export const platformsForType = (type: PostType) =>
  PLATFORMS.filter((p) => p.supports.includes(type));

/** Platforms that only take the first 4 images of a carousel. */
export const FOUR_IMAGE_PLATFORMS: PlatformId[] = ["twitter", "bluesky", "threads"];

export const ANALYTICS_PLATFORMS: PlatformId[] = ["tiktok", "youtube", "instagram"];

export const CAPTION_MAX = 2200;
