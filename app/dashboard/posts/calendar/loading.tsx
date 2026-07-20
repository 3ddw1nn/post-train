"use client";

import { useSearchParams } from "next/navigation";
import { CalendarGridSkeleton } from "./calendar-grid-skeleton";

export default function CalendarLoading() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "week" ? "week" : "month";

  return (
    <div className="fade-up lg:relative lg:left-1/2 lg:w-[calc(78vw-var(--pt-sidebar-width,232px)*0.12-2.3rem)] lg:max-w-[1410px] lg:-translate-x-1/2">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted">
          Every scheduled and published post, in your local timezone.
        </p>
      </div>
      <div className="card mt-5 overflow-hidden">
        <CalendarGridSkeleton view={view} />
      </div>
    </div>
  );
}
