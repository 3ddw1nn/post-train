"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DocGroup } from "@/lib/docs/types";
import { sectionHref } from "@/lib/docs/types";

/**
 * Sidebar navigation. Each section is now its own page (see docs-layout.tsx),
 * so this is plain links highlighting the current route — no scroll-spy, no
 * IntersectionObserver, no reading-line math. That machinery only existed to
 * simulate "which section are you on" on a single scrolling page; a router
 * already knows the answer for free once each section has its own URL.
 */
export function DocsNav({
  groups,
  basePath,
  firstId,
  activeId,
}: {
  groups: DocGroup[];
  basePath: string;
  firstId: string;
  activeId: string;
}) {
  const router = useRouter();

  return (
    <>
      {/* Mobile: a native select beats a hamburger drawer for a dozen-plus
          destinations — one tap, keyboard accessible, no focus trap. */}
      <div className="sticky top-14 z-20 -mx-6 mb-6 border-b border-line bg-white/95 px-6 py-2.5 backdrop-blur lg:hidden">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          Jump to
          <select
            value={activeId}
            onChange={(e) => router.push(sectionHref(basePath, e.target.value, firstId))}
            className="input !w-auto flex-1 !py-1.5 text-[13px] font-medium"
          >
            {groups.map((group) => (
              <optgroup key={group.id} label={group.title}>
                {group.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <nav
        aria-label="Documentation"
        className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pb-10"
      >
        {groups.map((group) => (
          <div key={group.id} className="mb-6">
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.sections.map((section) => {
                const isActive = activeId === section.id;
                return (
                  <li key={section.id}>
                    <Link
                      href={sectionHref(basePath, section.id, firstId)}
                      aria-current={isActive ? "page" : undefined}
                      className={`block rounded-md px-3 py-1.5 text-[13.5px] transition-colors ${
                        isActive
                          ? "bg-primary-soft font-semibold text-primary-deep"
                          : "font-medium text-ink/70 hover:bg-page hover:text-ink"
                      }`}
                    >
                      {section.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
