"use client";

// The filter controls shared by the Library page, the Batch Scheduler picker,
// and the composer's media modal. Filter *logic* lives in lib/media-filters.ts;
// this is only the UI.
//
// Which facets appear is a prop rather than fixed, because they genuinely don't
// all exist everywhere: raw uploads carry no studio_* fields, so a platform
// dropdown on an Uploads tab would always be empty, and a Drafts tab has no
// rendered output to have a type or platform yet. An always-visible control
// that's empty two-thirds of the time is worse than one that shows up when it
// applies.

import { Icon } from "./icons";
import { PlatformIcon } from "./platform-icon";
import { platform as platformOf } from "@/lib/platforms";
import type { FacetCounts, MediaFilter, MediaTypeFilter } from "@/lib/media-filters";

const TYPE_TABS: { key: MediaTypeFilter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "stack" },
  { key: "video", label: "Videos", icon: "video" },
  { key: "image", label: "Photos", icon: "image" },
];

/** Surfaces that can't offer every type. The composer modal picks exactly one
 *  item, so "All" would let you stare at a mixed grid for a single-slot pick;
 *  and in its video mode the type is locked entirely. */
export const PICK_ONE_TYPES: MediaTypeFilter[] = ["image", "video"];

export type TemplateOption = { id: string; label: string };

export function MediaFilterBar({
  filter,
  onChange,
  counts,
  platforms,
  templates,
  showType = true,
  showPlatform = true,
  showTemplate = false,
  typeOptions,
  className = "",
}: {
  filter: MediaFilter;
  onChange: (next: MediaFilter) => void;
  counts: FacetCounts;
  /** Platform ids available in the current set — usually platformsPresent(items). */
  platforms: string[];
  /** Template options, only meaningful on the Library. */
  templates?: TemplateOption[];
  showType?: boolean;
  showPlatform?: boolean;
  showTemplate?: boolean;
  /** Which type tabs to offer. Defaults to all three; see PICK_ONE_TYPES. A
   *  single-entry array renders no toggle at all, since there's nothing to pick. */
  typeOptions?: MediaTypeFilter[];
  className?: string;
}) {
  const tabs = typeOptions
    ? TYPE_TABS.filter((t) => typeOptions.includes(t.key))
    : TYPE_TABS;
  const hasType = showType && tabs.length > 1;
  const hasPlatform = showPlatform && platforms.length > 0;
  const hasTemplate = showTemplate && !!templates?.length;
  if (!hasType && !hasPlatform && !hasTemplate) return null;

  const activeCount = (filter.platform ? 1 : 0) + (filter.template ? 1 : 0);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {hasType && (
        <div
          className="flex items-center gap-1 rounded-lg border border-line bg-white p-1"
          role="tablist"
          aria-label="Media type"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter.type === t.key}
              onClick={() => onChange({ ...filter, type: t.key })}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                filter.type === t.key
                  ? "bg-primary-soft text-primary-deep"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Icon name={t.icon} size={13} /> {t.label}
              <span className="font-semibold opacity-70">{counts.type[t.key]}</span>
            </button>
          ))}
        </div>
      )}

      {hasPlatform && (
        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-white py-1 pl-2.5 pr-1 text-xs font-bold text-muted">
          {filter.platform ? (
            <PlatformIcon id={filter.platform} size={14} />
          ) : (
            <Icon name="globe" size={13} />
          )}
          <span className="sr-only">Filter by platform</span>
          <select
            value={filter.platform ?? ""}
            onChange={(e) => onChange({ ...filter, platform: e.target.value || null })}
            className="cursor-pointer border-0 bg-transparent py-0.5 pr-1 text-xs font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All platforms</option>
            {platforms.map((id) => (
              <option key={id} value={id}>
                {platformOf(id)?.name ?? id} ({counts.platform[id] ?? 0})
              </option>
            ))}
          </select>
        </label>
      )}

      {hasTemplate && (
        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-white py-1 pl-2.5 pr-1 text-xs font-bold text-muted">
          <Icon name="wand" size={13} />
          <span className="sr-only">Filter by studio</span>
          <select
            value={filter.template ?? ""}
            onChange={(e) => onChange({ ...filter, template: e.target.value || null })}
            className="cursor-pointer border-0 bg-transparent py-0.5 pr-1 text-xs font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All studios</option>
            {templates!.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({counts.template[t.id] ?? 0})
              </option>
            ))}
          </select>
        </label>
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange({ ...filter, platform: null, template: null })}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-muted transition-colors hover:text-ink"
        >
          <Icon name="x" size={12} strokeWidth={3} /> Clear
        </button>
      )}
    </div>
  );
}
