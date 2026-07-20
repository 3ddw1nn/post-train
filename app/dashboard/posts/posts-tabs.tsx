"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function PostsTabs({
  tabs,
  activeKey,
}: {
  tabs: { key: string; label: string; href: string }[];
  activeKey: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Optimistic: flips the instant the tab is clicked, ahead of the real navigation.
  const [optimisticKey, setOptimisticKey] = useState(activeKey);

  useEffect(() => {
    setOptimisticKey(activeKey);
  }, [activeKey, pathname, searchParams]);

  return (
    <div className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          onClick={() => setOptimisticKey(t.key)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            optimisticKey === t.key
              ? "border-primary text-ink"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
