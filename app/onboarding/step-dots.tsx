"use client";

import { usePathname } from "next/navigation";

const STEPS = [
  { match: "/onboarding/start", label: "Who's posting" },
  { match: "/onboarding/challenge", label: "Biggest challenge" },
  { match: "/onboarding/goal", label: "Your goal" },
  { match: "/onboarding/tour/cross-post", label: "Post everywhere" },
  { match: "/onboarding/tour/queue", label: "Stay consistent" },
  { match: "/onboarding/connect", label: "Connect accounts" },
  { match: "/onboarding/done", label: "All set" },
];

export function StepDots() {
  const path = usePathname();
  const index = STEPS.findIndex((s) => path.startsWith(s.match));
  const current = index === -1 ? 1 : index + 1;
  const total = STEPS.length;
  return (
    <div className="border-t border-line px-6 py-2.5">
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        <span className="hidden shrink-0 text-xs font-bold text-muted sm:inline">
          Step {current} of {total} · {STEPS[current - 1]?.label}
        </span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${(current / total) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
