import { SkeletonBlock } from "@/components/skeleton";

// Matches app/dashboard/tools/page.tsx: a single "Tools" heading (no
// subtitle) and ToolCardGrid's real card shape — an h-44 graphic region atop
// a p-5 title/description block, not an icon-and-two-lines card.
export default function ToolsLoading() {
  return (
    <div className="fade-up">
      <SkeletonBlock className="h-8 w-20" />
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* 12 registry tools + the Growth Playbook card. */}
        {Array.from({ length: 13 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line bg-white">
            <SkeletonBlock className="h-44 w-full rounded-none" />
            <div className="p-5">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="mt-2 h-3 w-full" />
              <SkeletonBlock className="mt-1.5 h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
