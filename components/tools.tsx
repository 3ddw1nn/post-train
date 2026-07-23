"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";

function ToolLoading() {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl bg-page p-6 text-sm text-muted">
      Loading tool...
    </div>
  );
}

const lazyTool = <T extends ComponentType<object>>(
  loader: () => Promise<T>
) => dynamic(loader, { loading: ToolLoading });

export const TOOL_COMPONENTS: Record<string, ComponentType<object>> = {
  "trend-finder": lazyTool(() =>
    import("./tool-widgets/trend-finder").then((m) => m.TrendFinder)
  ),
  "instagram-grid-maker": lazyTool(() =>
    import("./tool-widgets/image-splitters").then((m) => m.InstagramGridMaker)
  ),
  "carousel-splitter": lazyTool(() =>
    import("./tool-widgets/image-splitters").then((m) => m.CarouselSplitter)
  ),
  "instagram-handle-checker": lazyTool(() =>
    import("./tool-widgets/handle-checkers").then((m) => m.InstagramHandleChecker)
  ),
  "tiktok-username-checker": lazyTool(() =>
    import("./tool-widgets/handle-checkers").then((m) => m.TiktokUsernameChecker)
  ),
  "tiktok-caption-generator": lazyTool(() =>
    import("./tool-widgets/text-tools").then((m) => m.TiktokCaptionGenerator)
  ),
  "linkedin-formatter": lazyTool(() =>
    import("./tool-widgets/text-tools").then((m) => m.LinkedInFormatter)
  ),
  "youtube-title-checker": lazyTool(() =>
    import("./tool-widgets/text-tools").then((m) => m.YoutubeTitleChecker)
  ),
  "youtube-tag-generator": lazyTool(() =>
    import("./tool-widgets/text-tools").then((m) => m.YoutubeTagGenerator)
  ),
  "x-timeline-blocker": lazyTool(() =>
    import("./tool-widgets/text-tools").then((m) => m.XTimelineBlocker)
  ),
  "hashtag-counter": lazyTool(() =>
    import("./tool-widgets/text-tools").then((m) => m.HashtagCounter)
  ),
};
