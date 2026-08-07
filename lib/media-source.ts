// Where a media row came from — shared by every picker (Library, Batch
// Scheduler, and the Composer's media modal) so "Finished"/"Uploads" reads
// the same everywhere. Pure functions only, no JSX — see media-filter-bar.tsx
// and components/media.tsx for the UI.

/** The subset of a media row this module needs. Structural so it works for
 *  both ComposerMedia and the Library's own row type. */
export type SourcedMedia = {
  studio_template?: string | null;
  studio_finished_at?: string | null;
  created_at?: string;
};

/** Same ids/labels/icons as app/dashboard/library/page.tsx's TEMPLATES — kept
 *  as its own small map rather than imported, since that one lives in a page
 *  file (server component) and this is client-only display text. */
export const STUDIO_LABELS: Record<string, { label: string; icon: string }> = {
  "grid-2x2": { label: "2x2 Grid Video", icon: "grid" },
  "fade-in": { label: "Video Editor", icon: "video" },
  "ai-ugc": { label: "AI UGC Video", icon: "sparkles" },
  slideshow: { label: "Slideshow", icon: "image" },
  thumbnail: { label: "Thumbnail Maker", icon: "image" },
};

export function sourceLabel(media: SourcedMedia): { label: string; icon: string } {
  const studio = media.studio_template ? STUDIO_LABELS[media.studio_template] : undefined;
  return studio ?? { label: "Upload", icon: "upload" };
}

export function sourceDateLabel(media: SourcedMedia): { label: string; date: string; title: string } | null {
  const isStudio = Boolean(media.studio_finished_at);
  const iso = media.studio_finished_at ?? media.created_at;
  if (!iso || Number.isNaN(new Date(iso).getTime())) return null;

  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
  return {
    label: isStudio ? "Updated" : "Uploaded",
    date: formatted,
    title: `${isStudio ? "Last updated" : "Uploaded"} ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))}`,
  };
}

/** Where a file came from. Drafts is deliberately not a tab: a draft is an
 *  unfinished project, and its intermediate renders aren't work you'd want
 *  going live — they surface under Uploads with a count, not as a pick. */
export type Origin = "all" | "finished" | "uploads";

export function byOrigin<T extends SourcedMedia>(items: T[], which: Origin): T[] {
  return which === "all" ? items : items.filter((m) => (which === "finished" ? !!m.studio_finished_at : !m.studio_finished_at));
}
