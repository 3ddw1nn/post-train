"use client";

import { TOOL_COMPONENTS } from "@/components/tools";

export function ToolRenderer({ slug }: { slug: string }) {
  const Tool = TOOL_COMPONENTS[slug];
  return Tool ? <>{Tool()}</> : null;
}
