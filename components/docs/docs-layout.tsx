import type { ReactNode } from "react";
import type { DocGroup } from "@/lib/docs/types";
import { Block } from "./blocks";
import { DocsNav } from "./docs-nav";
import { PageActions } from "./page-actions";

/**
 * Shared shell for long-form pages: sidebar, one measure, anchored sections.
 *
 * Both the API reference and the growth playbook run through here, so the two
 * can't drift into slightly different documentation layouts — which is the
 * usual outcome when the second one gets built by copying the first.
 */
export function DocsLayout({
  groups,
  title,
  intro,
  markdown,
  markdownHref,
  cursorConfig,
  meta,
  footer,
}: {
  groups: DocGroup[];
  title: string;
  intro: string;
  markdown: string;
  markdownHref: string;
  /** Only the API reference offers the MCP connect actions. */
  cursorConfig?: string;
  meta?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:pt-12">
          <DocsNav groups={groups} />
        </aside>

        {/* One measure for everything. Capping prose but letting tables and code
            run the full column width leaves a ragged right edge and makes the
            page feel unset; a single ~70ch column keeps every element aligned. */}
        <div className="min-w-0 max-w-[46rem] pb-24 pt-10 lg:pt-12">
          <header className="border-b border-line pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[28px] font-extrabold tracking-tight text-ink">{title}</h1>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink/70 [text-wrap:pretty]">
                  {intro}
                </p>
              </div>
              <PageActions
                markdown={markdown}
                markdownHref={markdownHref}
                cursorConfig={cursorConfig}
              />
            </div>
            {meta}
          </header>

          {groups.map((group, gi) => (
            <section key={group.id} aria-labelledby={`${group.id}-heading`}>
              <h2
                id={`${group.id}-heading`}
                // The first group sits right under the header's rule, so a full
                // mt-16 there strands two horizontal lines around a dead band.
                className={`${gi === 0 ? "mt-8" : "mt-16"} border-b border-line pb-2 text-[13px] font-bold uppercase tracking-wider text-primary-deep`}
              >
                {group.title}
              </h2>

              {group.sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  // Anchored jumps must clear the sticky site nav, and
                  // scroll-margin does that without padding the layout.
                  className="scroll-mt-24 pt-8"
                >
                  <h3 className="group flex items-center gap-2 text-[19px] font-bold tracking-tight text-ink">
                    {section.title}
                    <a
                      href={`#${section.id}`}
                      aria-label={`Link to ${section.title}`}
                      className="text-muted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      #
                    </a>
                  </h3>
                  {section.blocks.map((block, i) => (
                    <Block key={i} block={block} />
                  ))}
                </section>
              ))}
            </section>
          ))}

          {footer}
        </div>
      </div>
    </div>
  );
}
