"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Tracks whether an internal link click on `routePathname` is mid-flight, so a page can
 * show an instant skeleton/overlay before the real (server-rendered) navigation settles.
 * Resolves itself once the URL actually changes; times out as a safety net.
 */
export function usePendingNav(routePathname: string, onNavigate?: (url: URL) => void) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    let timeout: number | undefined;

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      if (nextUrl.pathname !== routePathname) return;
      if (nextUrl.href === window.location.href) return;

      onNavigate?.(nextUrl);
      setPending(true);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setPending(false), 6000);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timeout);
    };
  }, [routePathname, onNavigate]);

  return pending;
}
