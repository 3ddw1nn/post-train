import { SkeletonBlock } from "@/components/skeleton";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarGridSkeleton({ view }: { view: "month" | "week" }) {
  const cellCount = view === "week" ? 7 : 42;
  const cellHeight = view === "week" ? "min-h-[486px]" : "min-h-[113px]";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <SkeletonBlock className="h-8 w-8" />
          <SkeletonBlock className="h-8 w-40" />
          <SkeletonBlock className="h-8 w-8" />
          <SkeletonBlock className="h-8 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-9 w-36" />
          <SkeletonBlock className="h-9 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-line bg-page/50">
        {DAY_LABELS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-bold text-muted">
            {day}
          </div>
        ))}
      </div>
      <div className={`grid grid-cols-7 ${view === "week" ? "min-h-[486px]" : ""}`}>
        {Array.from({ length: cellCount }).map((_, index) => (
          <div
            key={index}
            className={`${cellHeight} border-b border-r border-line p-1.5 ${
              view === "month" && (index < 3 || index > 34) ? "bg-page/40" : "bg-white"
            }`}
          >
            <SkeletonBlock className="h-6 w-6 rounded-full" />
            {index % 5 === 0 ? (
              <div className="mt-2 flex flex-col gap-1">
                <SkeletonBlock className="h-7 w-full" />
                <SkeletonBlock className="h-7 w-4/5" />
              </div>
            ) : (
              <SkeletonBlock className="mx-auto mt-3 h-3 w-12" />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
