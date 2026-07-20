"use client";

import { usePendingNav } from "@/lib/use-pending-nav";
import { CardListSkeleton, SkeletonBlock } from "@/components/skeleton";

/** Instant skeleton over the list area for any internal /dashboard/posts link click —
 *  tabs, filters, period pills, pagination — while the real navigation is in flight. */
export function PostsPendingOverlay() {
  const pending = usePendingNav("/dashboard/posts");
  if (!pending) return null;

  return (
    <div className="absolute inset-0 z-20 bg-page">
      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-8 w-20 rounded-full" />
        <SkeletonBlock className="h-8 w-24 rounded-full" />
        <SkeletonBlock className="h-8 w-16 rounded-full" />
      </div>
      <div className="mt-4">
        <CardListSkeleton rows={5} />
      </div>
    </div>
  );
}
