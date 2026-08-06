// Shared media filtering for every surface that browses the Library: the
// Library page, the Batch Scheduler picker, and the composer's media modal.
//
// Each of those three used to hand-roll its own type filter, and all three now
// need platform filtering too — writing it a third time is how the app ended up
// with three near-identical pickers in the first place. The *filters* are
// shared here; each surface still renders its own grid, because managing media
// (delete, resume, batch grouping) and picking media are genuinely different
// jobs.
//
// Pure functions only, no JSX — see components/media-filter-bar.tsx for the UI.

/** The subset of a media row this module needs. Structural so both `MediaRow`
 *  (lib/media.ts) and `ComposerMedia` (components/media.tsx) satisfy it. */
export type FilterableMedia = {
  kind: string;
  studio_template?: string | null;
  studio_platform_id?: string | null;
  studio_platform_ids?: string[];
};

export type MediaTypeFilter = "all" | "video" | "image";

export type MediaFilter = {
  type: MediaTypeFilter;
  /** Platform id, or null for "any platform". */
  platform: string | null;
  /** Studio template id, or null for "any template". */
  template: string | null;
};

export const EMPTY_FILTER: MediaFilter = { type: "all", platform: null, template: null };

/**
 * The platform(s) a file was actually rendered for.
 *
 * Precedence matters and is not a merge. `studio_platform_id` is the single
 * destination *this specific output* was rendered for; when it's set it is
 * authoritative. `studio_platform_ids` is every destination the whole batch
 * targeted, which is only the right answer when there's no per-output
 * destination — Slideshow finishes N slides that serve all destinations at
 * once, so its rows have a populated array and a null singular.
 *
 * Unioning them (the previous inline behavior in components/media.tsx) makes a
 * 9:16 TikTok export from a batch that also targeted Instagram claim it's "for
 * Instagram", so filtering by Instagram surfaces the wrong cut. Create Post
 * already relies on the singular for exactly this reason — to avoid pairing a
 * platform with the wrong exported video.
 */
export function platformIdsFor(media: FilterableMedia): string[] {
  if (media.studio_platform_id) return [media.studio_platform_id];
  return [...new Set(media.studio_platform_ids ?? [])];
}

function matchesType(media: FilterableMedia, type: MediaTypeFilter): boolean {
  return type === "all" || media.kind === type;
}

export function applyMediaFilter<T extends FilterableMedia>(items: T[], filter: MediaFilter): T[] {
  return items.filter((item) => {
    if (!matchesType(item, filter.type)) return false;
    if (filter.platform && !platformIdsFor(item).includes(filter.platform)) return false;
    if (filter.template && item.studio_template !== filter.template) return false;
    return true;
  });
}

export type FacetCounts = {
  type: Record<MediaTypeFilter, number>;
  /** Platform id → count. Only platforms actually present appear. */
  platform: Record<string, number>;
  /** Template id → count. Only templates actually present appear. */
  template: Record<string, number>;
};

/**
 * Counts for each facet value, computed against the items *already narrowed by
 * the other facets* — so switching to "Instagram" can't leave you staring at a
 * type tab that claims 8 and then renders nothing. Each facet is counted with
 * itself excluded from the filter, which is what makes the numbers describe
 * "what you'd get if you picked this".
 */
export function facetCounts(items: FilterableMedia[], filter: MediaFilter): FacetCounts {
  const forType = applyMediaFilter(items, { ...filter, type: "all" });

  const platform: Record<string, number> = {};
  for (const item of applyMediaFilter(items, { ...filter, platform: null })) {
    for (const id of platformIdsFor(item)) platform[id] = (platform[id] ?? 0) + 1;
  }

  const template: Record<string, number> = {};
  for (const item of applyMediaFilter(items, { ...filter, template: null })) {
    if (item.studio_template) template[item.studio_template] = (template[item.studio_template] ?? 0) + 1;
  }

  return {
    type: {
      all: forType.length,
      video: forType.filter((i) => i.kind === "video").length,
      image: forType.filter((i) => i.kind === "image").length,
    },
    platform,
    template,
  };
}

/** Platform ids present across a set, for populating a dropdown. */
export function platformsPresent(items: FilterableMedia[]): string[] {
  return [...new Set(items.flatMap(platformIdsFor))];
}
