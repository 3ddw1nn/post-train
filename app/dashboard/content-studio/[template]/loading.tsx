"use client";

import { usePathname } from "next/navigation";
import { StudioChooserSkeleton, SlideshowStudioSkeleton, ThumbnailStudioSkeleton } from "@/components/skeleton";

// loading.tsx doesn't receive the [template] route param, so the template
// slug is read off the URL directly (same pattern as posts/calendar's loading).
// Each real studio (grid-studio.tsx, studio.tsx's FadeInStudio, ai-ugc-studio.tsx)
// starts in its own "choose" mode, sharing one CTA-card + drafts-card shape at
// a template-specific max width — see StudioChooserSkeleton's own comment.
// Slideshow and Thumbnail Maker look nothing like that shape, so they keep
// dedicated skeletons.
export default function StudioTemplateLoading() {
  const pathname = usePathname();
  const template = pathname.split("/").pop();
  if (template === "slideshow") return <SlideshowStudioSkeleton />;
  if (template === "thumbnail") return <ThumbnailStudioSkeleton />;
  if (template === "ai-ugc") return <StudioChooserSkeleton maxW="max-w-5xl" />;
  // grid-2x2, fade-in / video-editor, and any future/unknown slug.
  return <StudioChooserSkeleton maxW="max-w-4xl" />;
}
