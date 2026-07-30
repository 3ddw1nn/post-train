"use client";

import { usePathname } from "next/navigation";
import { SkeletonBlock } from "@/components/skeleton";

// loading.tsx doesn't receive the [tool] route param, so the slug is read
// off the URL directly (same pattern as content-studio/[template]'s loading).
// Trend Finder is the one tool page.tsx renders full-bleed (`wide`, see its
// wideShell class) instead of the standard max-w-2xl card — everything else
// (caption generators, checkers, counters) shares that narrow shape.
export default function DashboardToolLoading() {
  const pathname = usePathname();
  const tool = pathname.split("/").pop();
  const wide = tool === "trend-finder";

  return (
    <div className="fade-up">
      <SkeletonBlock className="h-4 w-28" />
      <div className="mt-4">
        <SkeletonBlock className="h-8 w-64" />
        <SkeletonBlock className="mt-2 h-4 w-96 max-w-full" />
      </div>
      {wide ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-10 w-64" />
          <SkeletonBlock className="h-10 w-40" />
          <SkeletonBlock className="ml-auto h-10 w-28" />
        </div>
      ) : (
        <div className="card mt-5 max-w-2xl p-6">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="mt-4 h-32 w-full" />
        </div>
      )}
      {wide && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4">
              <SkeletonBlock className="h-32 w-full" />
              <SkeletonBlock className="mt-3 h-4 w-3/4" />
              <SkeletonBlock className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
