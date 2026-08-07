// Which aspect ratios each platform actually accepts, and whether a given
// file matches. Derived from VIDEO_PRESETS rather than restated, so the
// Content Studio's render targets and the scheduler's warnings can never
// drift apart — there is one table of "what fits where" in this codebase.
//
// Pure functions only, no JSX — checked by `npm run check:aspect`.

import { VIDEO_ASPECTS, VIDEO_PRESETS, type VideoAspectId } from "./video-render-settings";
import type { PlatformId } from "./platforms";

/** The subset of a media row this module needs. Structural so ComposerMedia
 *  and the Library's own row type both satisfy it. */
export type SizedMedia = {
  width?: number | null;
  height?: number | null;
  /** Set on Content Studio exports — authoritative when present, since the
   *  file was rendered *for* that ratio. */
  studio_aspect_ratio?: string | null;
};

/**
 * platformId → the aspect ratios it has a documented placement for.
 *
 * A platform absent from this map (Tumblr today) has no declared constraint
 * and is treated as accepting anything — silence is not the same as "nothing
 * fits", and warning on every file for a platform we simply haven't mapped
 * would train people to ignore the warnings.
 */
export const PLATFORM_ASPECTS: Partial<Record<PlatformId, VideoAspectId[]>> = (() => {
  const map: Partial<Record<PlatformId, VideoAspectId[]>> = {};
  for (const preset of VIDEO_PRESETS) {
    for (const target of preset.targets) {
      const list = map[target.platformId] ?? [];
      if (!list.includes(preset.aspect.id)) list.push(preset.aspect.id);
      map[target.platformId] = list;
    }
  }
  return map;
})();

/**
 * The standard aspect a file is closest to, or null if it isn't close to any.
 *
 * The 0.035 threshold is deliberately the one the Library already uses to
 * print an aspect badge: if a card shows "9:16", the scheduler must not then
 * claim the same file isn't 9:16.
 */
export function nearestAspectId(width?: number | null, height?: number | null): VideoAspectId | null {
  if (!width || !height) return null;
  const ratio = width / height;
  const closest = VIDEO_ASPECTS.map((a) => ({
    id: a.id,
    difference: Math.abs(ratio - a.width / a.height),
  })).sort((a, b) => a.difference - b.difference)[0];
  return closest && closest.difference < 0.035 ? closest.id : null;
}

/** The aspect a file should be judged as: a Studio export states its own, and
 *  anything else is measured from its pixels. */
export function aspectOf(media: SizedMedia): VideoAspectId | null {
  const declared = media.studio_aspect_ratio;
  if (declared && VIDEO_ASPECTS.some((a) => a.id === declared)) return declared as VideoAspectId;
  return nearestAspectId(media.width, media.height);
}

export type AspectFit = {
  /** False only when we positively know the file doesn't fit. */
  ok: boolean;
  /** The aspect we judged it as, or null when it isn't near a standard one. */
  aspect: VideoAspectId | null;
  /** What the platform does accept — empty when it declares no constraint. */
  supported: VideoAspectId[];
};

/**
 * Does this file fit the platform's placements?
 *
 * "Unknown" is not a failure. A file with no stored dimensions, or a platform
 * with no declared placements, passes — a warning we can't stand behind is
 * worse than no warning. The caller writes the sentence, since it already has
 * the platform's display name.
 */
export function checkPlatformAspect(media: SizedMedia, platformId: string): AspectFit {
  const supported = PLATFORM_ASPECTS[platformId as PlatformId] ?? [];
  const aspect = aspectOf(media);
  if (supported.length === 0 || aspect === null) return { ok: true, aspect, supported };
  return { ok: supported.includes(aspect), aspect, supported };
}

/** Human list: "9:16", or "4:5, 1:1 and 16:9". Lives here so every surface
 *  phrases the constraint identically. */
export function formatAspectList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
