import type { PlatformId } from "@/lib/platforms";

export type VideoAspectId = "9:16" | "2:3" | "4:5" | "1:1" | "16:9";
export type VideoPresetId = "vertical-short" | "portrait-feed" | "square-feed" | "landscape" | "pinterest-pin";
export type VideoFps = 24 | 30 | 60;

export type VideoAspect = {
  id: VideoAspectId;
  name: string;
  hint: string;
  width: number;
  height: number;
  px: string;
};

export const VIDEO_ASPECTS: VideoAspect[] = [
  { id: "9:16", name: "9:16", hint: "Portrait", width: 1080, height: 1920, px: "1080×1920px" },
  { id: "2:3", name: "2:3", hint: "Portrait", width: 1000, height: 1500, px: "1000×1500px" },
  { id: "4:5", name: "4:5", hint: "Portrait", width: 1080, height: 1350, px: "1080×1350px" },
  { id: "1:1", name: "1:1", hint: "Square", width: 1080, height: 1080, px: "1080×1080px" },
  { id: "16:9", name: "16:9", hint: "Landscape", width: 1920, height: 1080, px: "1920×1080px" },
];

export type VideoPresetTarget = {
  platformId: PlatformId;
  label: string;
};

export type VideoPreset = {
  id: VideoPresetId;
  name: string;
  placement: string;
  description: string;
  aspect: VideoAspect;
  targets: VideoPresetTarget[];
};

const aspect = (id: VideoAspectId) => VIDEO_ASPECTS.find((a) => a.id === id)!;

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "vertical-short",
    name: "Vertical Short Video",
    placement: "Reels, Shorts, TikToks, full-screen Pins",
    description: "Best for full-screen mobile short-form video.",
    aspect: aspect("9:16"),
    targets: [
      { platformId: "tiktok", label: "TikTok" },
      { platformId: "youtube", label: "YouTube Shorts" },
      { platformId: "instagram", label: "Instagram Reels" },
      { platformId: "facebook", label: "Facebook Reels" },
      { platformId: "pinterest", label: "Pinterest full-screen video Pins" },
    ],
  },
  {
    id: "portrait-feed",
    name: "Portrait Feed Video",
    placement: "Mobile feed",
    description: "Best for taller feed posts with strong mobile coverage.",
    aspect: aspect("4:5"),
    targets: [
      { platformId: "instagram", label: "Instagram Feed" },
      { platformId: "facebook", label: "Facebook Feed" },
      { platformId: "threads", label: "Threads" },
      { platformId: "linkedin", label: "LinkedIn" },
      { platformId: "twitter", label: "X" },
    ],
  },
  {
    id: "square-feed",
    name: "Square Feed Video",
    placement: "General feed",
    description: "Safe feed format across social platforms.",
    aspect: aspect("1:1"),
    targets: [
      { platformId: "twitter", label: "X" },
      { platformId: "bluesky", label: "Bluesky" },
      { platformId: "mastodon", label: "Mastodon" },
      { platformId: "linkedin", label: "LinkedIn" },
      { platformId: "threads", label: "Threads" },
      { platformId: "facebook", label: "Facebook" },
      { platformId: "instagram", label: "Instagram Feed" },
      { platformId: "google_business", label: "Google Business Profile" },
    ],
  },
  {
    id: "landscape",
    name: "Landscape Video",
    placement: "Standard video",
    description: "Best for traditional horizontal and long-form video.",
    aspect: aspect("16:9"),
    targets: [
      { platformId: "youtube", label: "Standard YouTube videos" },
      { platformId: "facebook", label: "Facebook landscape videos" },
      { platformId: "twitter", label: "X" },
      { platformId: "linkedin", label: "LinkedIn" },
      { platformId: "bluesky", label: "Bluesky" },
      { platformId: "mastodon", label: "Mastodon" },
    ],
  },
  {
    id: "pinterest-pin",
    name: "Pinterest Portrait Pin",
    placement: "Standard video Pin",
    description: "Best for Pinterest's standard portrait feed pin.",
    aspect: aspect("2:3"),
    targets: [{ platformId: "pinterest", label: "Pinterest standard video Pins" }],
  },
];

export const VIDEO_FPS_OPTIONS: VideoFps[] = [24, 30, 60];

export function videoAspectById(id: unknown): VideoAspect | null {
  return VIDEO_ASPECTS.find((a) => a.id === id) ?? null;
}

export function videoPresetById(id: unknown): VideoPreset | null {
  return VIDEO_PRESETS.find((p) => p.id === id) ?? null;
}

export function videoPresetForLegacyPlatform(platformId: string): VideoPreset {
  return VIDEO_PRESETS.find((p) => p.targets.some((t) => t.platformId === platformId)) ?? VIDEO_PRESETS[0];
}

export function normalizeVideoFps(value: unknown): VideoFps {
  const fps = Number(value);
  return VIDEO_FPS_OPTIONS.includes(fps as VideoFps) ? (fps as VideoFps) : 60;
}
