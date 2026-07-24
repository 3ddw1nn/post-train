"use client";

import { usePathname } from "next/navigation";
import { StudioWizardSkeleton, SlideshowStudioSkeleton } from "@/components/skeleton";

// loading.tsx doesn't receive the [template] route param, so the template
// slug is read off the URL directly (same pattern as posts/calendar's loading).
export default function StudioTemplateLoading() {
  const pathname = usePathname();
  const template = pathname.split("/").pop();
  if (template === "slideshow") return <SlideshowStudioSkeleton />;
  return <StudioWizardSkeleton />;
}
