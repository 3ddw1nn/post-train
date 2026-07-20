import { SkeletonBlock } from "@/components/skeleton";

export default function ToolsLoading() {
  return (
    <div className="fade-up">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <SkeletonBlock className="h-8 w-20" />
        <SkeletonBlock className="h-4 w-52 max-w-full" />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-white p-5">
            <SkeletonBlock className="h-11 w-11 rounded-xl" />
            <SkeletonBlock className="mt-3 h-4 w-3/4" />
            <SkeletonBlock className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
