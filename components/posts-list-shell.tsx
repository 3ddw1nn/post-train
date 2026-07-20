"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { OptimisticPostEvent } from "./post-actions";

export function PostsListShell({ children }: { children: React.ReactNode }) {
  const [optimistic, setOptimistic] = useState<OptimisticPostEvent | null>(null);

  useEffect(() => {
    function onPost(event: Event) {
      setOptimistic((event as CustomEvent<OptimisticPostEvent>).detail);
    }
    function onClear() {
      setOptimistic(null);
    }
    window.addEventListener("pt:optimistic-post", onPost);
    window.addEventListener("pt:optimistic-post-clear", onClear);
    return () => {
      window.removeEventListener("pt:optimistic-post", onPost);
      window.removeEventListener("pt:optimistic-post-clear", onClear);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {optimistic && (
        <div className="card p-4 opacity-90">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-page text-muted">
              <Icon name="copy" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{optimistic.caption}</p>
              <p className="mt-1.5 text-xs font-semibold text-muted">Duplicating into drafts...</p>
            </div>
            <span className="pill bg-primary-soft text-primary-deep">{optimistic.status}</span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
