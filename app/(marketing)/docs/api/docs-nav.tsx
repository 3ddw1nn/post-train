"use client";

import { useEffect, useMemo, useState } from "react";
import type { DocGroup } from "@/lib/docs/api-reference";

/** Distance below the viewport top that counts as "what you're reading". */
const READING_LINE = 120;

/**
 * Sidebar scroll-spy.
 *
 * Deliberately not IntersectionObserver-with-a-band: adjacent sections both
 * intersect a band whenever a boundary sits inside it, and any tiebreak you
 * pick is wrong in one scroll direction. (Document order highlights the
 * section you're leaving on the way down; reverse order does the same on the
 * way up.) Reading rects against a single line has one unambiguous answer —
 * the last section that has started — and it's cheap at this section count.
 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      // Bottom of the page: the final section wins even if it starts below the
      // line, otherwise the last nav item can never be reached by scrolling.
      const atBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      if (atBottom) {
        setActive(ids[ids.length - 1] ?? "");
        return;
      }
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= READING_LINE) current = id;
        else break; // sections are in document order; the rest are further down
      }
      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // `ids` is a fresh array each render; key on contents so listeners bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);

  return active;
}

export function DocsNav({ groups }: { groups: DocGroup[] }) {
  const ids = useMemo(
    () => groups.flatMap((g) => g.sections.map((s) => s.id)),
    [groups]
  );
  const active = useActiveSection(ids);

  return (
    <>
      {/* Mobile: a native select beats a hamburger drawer for 14 anchors —
          it's one tap, keyboard accessible, and needs no focus trap. */}
      <div className="sticky top-14 z-20 -mx-6 mb-6 border-b border-line bg-white/95 px-6 py-2.5 backdrop-blur lg:hidden">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          Jump to
          <select
            value={active}
            onChange={(e) => {
              document.getElementById(e.target.value)?.scrollIntoView({ behavior: "smooth" });
            }}
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
                const isActive = active === section.id;
                return (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      aria-current={isActive ? "location" : undefined}
                      className={`block rounded-md px-3 py-1.5 text-[13.5px] transition-colors ${
                        isActive
                          ? "bg-primary-soft font-semibold text-primary-deep"
                          : "font-medium text-ink/70 hover:bg-page hover:text-ink"
                      }`}
                    >
                      {section.title}
                    </a>
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
