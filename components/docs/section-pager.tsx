import Link from "next/link";
import { Icon } from "@/components/icons";
import type { FlatSection } from "@/lib/docs/types";

/**
 * Previous/next footer nav. Crossing a group boundary carries the group name
 * along with the section title — "REST API → Posts" reads as a real move
 * forward, where "Posts" alone reads like a sibling of whatever you just left.
 */
export function SectionPager({
  basePath,
  prev,
  next,
}: {
  basePath: string;
  prev: FlatSection | null;
  next: FlatSection | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="Section navigation" className="mt-14 grid grid-cols-2 gap-3 border-t border-line pt-6">
      {prev ? (
        <Link
          href={prev.index === 0 ? basePath : `${basePath}/${prev.id}`}
          className="group flex flex-col items-start rounded-lg border border-line px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
        >
          <span className="flex items-center gap-1 text-xs font-medium text-muted">
            <Icon name="chevronLeft" size={13} className="transition-transform group-hover:-translate-x-0.5" />
            {prev.groupTitle}
          </span>
          <span className="mt-0.5 text-[14.5px] font-semibold text-ink">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`${basePath}/${next.id}`}
          className="group flex flex-col items-end rounded-lg border border-line px-4 py-3 text-right transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
        >
          <span className="flex items-center gap-1 text-xs font-medium text-muted">
            {next.groupTitle}
            <Icon name="chevronRight" size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-0.5 text-[14.5px] font-semibold text-ink">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
