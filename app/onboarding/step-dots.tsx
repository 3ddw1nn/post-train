"use client";

import { usePathname } from "next/navigation";

export function StepDots() {
  const path = usePathname();
  const current = path.startsWith("/onboarding/plans")
    ? 3
    : path.startsWith("/onboarding/connect")
      ? 2
      : 1;
  return (
    <div className="hidden items-center sm:flex" aria-label={`Step ${current} of 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className="flex items-center">
          {n > 1 && <span className={`h-0.5 w-10 ${n <= current ? "bg-primary" : "bg-line"}`} />}
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              n < current
                ? "bg-primary text-[#0c2e1a]"
                : n === current
                  ? "border-2 border-primary bg-white text-primary-deep"
                  : "border border-line bg-white text-muted"
            }`}
          >
            {n}
          </span>
        </span>
      ))}
    </div>
  );
}
