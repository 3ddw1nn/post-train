// Canvas sizes and AI prompt assembly for the Thumbnail Maker Content Studio
// template (components/thumbnail-studio.tsx).
//
// Pure and dependency-free so the prompt builder can be unit-tested without a
// browser or a provider key — see lib/thumbnail-prompt.test.mjs.

/**
 * How a platform accepts a cover image, which is not the same question as
 * "what size is it". Surfaced in the UI so nobody designs a TikTok cover and
 * then discovers it can only be set by hand in the app:
 *   api        — a custom image can be uploaded through the platform's API
 *   frame-only — the API only picks an existing video frame by timestamp
 *   manual     — export and set it yourself
 */
export type CoverSupport = "api" | "frame-only" | "manual";

export type ThumbnailPreset = {
  id: string;
  label: string;
  w: number;
  h: number;
  /** Aspect string in the form providers expect ("16:9"). */
  aspect: string;
  hint: string;
  coverSupport: CoverSupport;
  /** Shown under the picker when coverSupport isn't "api". */
  note?: string;
  /** lib/platforms.ts PlatformId, for the tab's icon — unset for platform-agnostic presets like Square. */
  platformId?: string;
};

export const THUMBNAIL_PRESETS: ThumbnailPreset[] = [
  {
    id: "youtube",
    label: "YouTube video",
    w: 1280,
    h: 720,
    aspect: "16:9",
    hint: "1280×720",
    coverSupport: "api",
    platformId: "youtube",
  },
  {
    id: "youtube-shorts",
    label: "YouTube Shorts",
    w: 1080,
    h: 1920,
    aspect: "9:16",
    hint: "1080×1920",
    coverSupport: "api",
    platformId: "youtube",
  },
  {
    id: "instagram-reels",
    label: "Instagram Reels",
    w: 1080,
    h: 1920,
    aspect: "9:16",
    hint: "1080×1920",
    coverSupport: "api",
    platformId: "instagram",
  },
  {
    // Meta's Graph API exposes a dedicated /{video-id}/thumbnails endpoint for
    // uploading a custom cover — same underlying capability Instagram Reels
    // uses above. 9:16 because Reels is where Facebook video reach actually
    // is now (feed video gets cropped to 4:5, but Reels is the native format).
    id: "facebook",
    label: "Facebook Reels",
    w: 1080,
    h: 1920,
    aspect: "9:16",
    hint: "1080×1920",
    coverSupport: "api",
    platformId: "facebook",
  },
  {
    // LinkedIn's Videos API takes a thumbnailUploadUrl alongside the video
    // upload. 16:9 is LinkedIn's own primary recommendation for native video,
    // even though 1:1/4:5/9:16 all work.
    id: "linkedin",
    label: "LinkedIn video",
    w: 1920,
    h: 1080,
    aspect: "16:9",
    hint: "1920×1080",
    coverSupport: "api",
    platformId: "linkedin",
  },
  {
    // Pinterest's Pin API takes a cover_url/thumbNail alongside the video.
    // 2:3 is Pinterest's own highest-CTR recommendation for video pins.
    id: "pinterest",
    label: "Pinterest video pin",
    w: 1000,
    h: 1500,
    aspect: "2:3",
    hint: "1000×1500",
    coverSupport: "api",
    platformId: "pinterest",
  },
  {
    // Mastodon's media endpoints (v1/v2 media) accept a `thumbnail` field
    // alongside audio/video uploads, since Mastodon 3.2.0. No fixed native
    // aspect — 1:1 as a safe default.
    id: "mastodon",
    label: "Mastodon video",
    w: 1080,
    h: 1080,
    aspect: "1:1",
    hint: "1080×1080",
    coverSupport: "api",
    platformId: "mastodon",
  },
  {
    id: "tiktok",
    label: "TikTok",
    w: 1080,
    h: 1920,
    aspect: "9:16",
    hint: "1080×1920",
    coverSupport: "frame-only",
    note: "TikTok's API can only pick a frame from the video — set a custom cover by hand in the app after posting.",
    platformId: "tiktok",
  },
  {
    // X/Twitter, Bluesky, and Threads are deliberately absent above: all three
    // auto-generate a video thumbnail with no override, not
    // even by hand in their own app — there's nowhere for a custom cover to
    // go. This generic square is the fallback for those and anything else.
    id: "square",
    label: "Square",
    w: 1080,
    h: 1080,
    aspect: "1:1",
    hint: "1080×1080",
    coverSupport: "manual",
    note: "Not a platform cover slot — export and upload this one yourself. (X/Twitter, Bluesky, and Threads don't support a custom video thumbnail at all, even manually — they always show an auto-generated frame.)",
  },
];

export const DEFAULT_PRESET_ID = "youtube";

export function thumbnailPreset(id: string): ThumbnailPreset {
  return THUMBNAIL_PRESETS.find((preset) => preset.id === id) ?? THUMBNAIL_PRESETS[0];
}

/**
 * Emotional framings for the same subject. Generating one thumbnail is a coin
 * flip; generating the same subject through five different angles is how you
 * get something worth picking between.
 */
export const THUMBNAIL_ANGLES = [
  { id: "curiosity", label: "Curiosity", clause: "an unresolved, intriguing moment that raises a question in the viewer's mind" },
  { id: "transformation", label: "Transformation", clause: "a striking before-and-after contrast implying dramatic change" },
  { id: "conflict", label: "Conflict", clause: "visible tension or opposition between two forces" },
  { id: "proof", label: "Proof", clause: "tangible evidence of a result, shown as a concrete physical object or scene" },
  { id: "outcome", label: "Outcome", clause: "the triumphant end state, the payoff already achieved" },
] as const;

export type ThumbnailAngleId = (typeof THUMBNAIL_ANGLES)[number]["id"];

export const THUMBNAIL_STYLES = [
  { id: "photo", label: "Photoreal", clause: "photorealistic, shot on a fast prime lens" },
  { id: "cinematic", label: "Cinematic", clause: "cinematic film still, dramatic volumetric lighting, teal and orange grade" },
  { id: "bold", label: "Bold graphic", clause: "bold flat graphic illustration, thick clean shapes, poster art" },
  { id: "3d", label: "3D render", clause: "glossy 3D render, soft studio lighting, subtle rim light" },
  { id: "vibrant", label: "Hyper-vibrant", clause: "hyper-saturated punchy colors, energetic and loud" },
] as const;

export type ThumbnailStyleId = (typeof THUMBNAIL_STYLES)[number]["id"];

/**
 * Text is never generated by the model. Every serious thumbnail workflow
 * composites the headline afterwards with real fonts, because image models
 * still garble words — so the prompt actively suppresses text and the canvas
 * editor puts it back on top.
 */
const NO_TEXT_CONSTRAINT =
  "Absolutely no text, no words, no letters, no numbers, no captions, no watermark, no logo, no signature anywhere in the image.";

/**
 * The legibility rules that separate a thumbnail from a nice picture: it is
 * judged at roughly 320px wide next to a dozen competitors, so one subject,
 * hard contrast, and a background that stays out of the way.
 */
const LEGIBILITY_CONSTRAINT =
  "High contrast composition with a single clear focal subject, sharply lit and separated from a darker, simpler, shallow depth-of-field background. Leave uncluttered negative space on one side for a headline to be added later. Must stay instantly readable when scaled down to 320px wide.";

export type ThumbnailPromptInput = {
  subject: string;
  angle?: string;
  style?: string;
  presetId?: string;
  /** Set when the user attached a reference photo, so the model is told to use it. */
  hasReference?: boolean;
};

/**
 * Assembles the full image prompt from the user's one-line subject. Kept
 * deterministic (no model call) so the same inputs always produce the same
 * prompt and the constraints can be asserted in a test.
 */
export function buildThumbnailPrompt(input: ThumbnailPromptInput): string {
  const subject = input.subject.trim().slice(0, 600);
  if (!subject) throw new Error("A subject is required.");

  const preset = thumbnailPreset(input.presetId ?? DEFAULT_PRESET_ID);
  const angle = THUMBNAIL_ANGLES.find((a) => a.id === input.angle);
  const style = THUMBNAIL_STYLES.find((s) => s.id === input.style) ?? THUMBNAIL_STYLES[0];

  const parts = [
    `A ${preset.aspect} video thumbnail background image.`,
    `Subject: ${subject}.`,
    angle && `Emotional angle: ${angle.clause}.`,
    `Style: ${style.clause}.`,
    input.hasReference &&
      "Use the attached reference image for the likeness of the person and keep their face clearly recognisable.",
    // Faces measurably out-perform everything else, but only if the expression
    // is doing work — a neutral face is no better than no face.
    "If a person appears, show a strong, unambiguous facial expression, face large in frame and looking toward the camera.",
    LEGIBILITY_CONSTRAINT,
    NO_TEXT_CONSTRAINT,
  ];

  return parts.filter(Boolean).join(" ");
}
