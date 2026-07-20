"use client";

import { useCallback, useState } from "react";
import { usePendingNav } from "@/lib/use-pending-nav";
import { CalendarGridSkeleton } from "./calendar-grid-skeleton";

export function CalendarPendingOverlay({ view }: { view: "month" | "week" }) {
  // The view of the page we're navigating TO, not the one currently on screen —
  // matters when the click that triggers this is itself the month/week toggle.
  const [pendingView, setPendingView] = useState<"month" | "week">(view);
  const onNavigate = useCallback((url: URL) => {
    setPendingView(url.searchParams.get("view") === "week" ? "week" : "month");
  }, []);
  const pending = usePendingNav("/dashboard/posts/calendar", onNavigate);

  if (!pending) return null;

  return (
    <div className="absolute inset-0 z-20 bg-white">
      <CalendarGridSkeleton view={pendingView} />
    </div>
  );
}
