import type { ReactNode } from "react";
import type { DocGroup, DocSection, FlatSection } from "@/lib/docs/types";
import { Block } from "./blocks";
import { DocsNav } from "./docs-nav";
import { PageActions } from "./page-actions";
import { SectionPager } from "./section-pager";

/**
 * Shared shell for long-form pages: sidebar, one measure, one section per
 * page, a top bar that keeps Copy Page pinned to the corner regardless of
 * title length, and a Prev/Next pager at the bottom.
 *
 * Both the API reference and the growth playbook run through here, so the two
 * can't drift into slightly different documentation layouts — which is the
 * usual outcome when the second one gets built by copying the first.
 */
export function DocsLayout({
  groups,
  basePath,
  firstId,
  docTitle,
  group,
  section,
  prev,
  next,
  markdown,
  markdownHref,
  cursorConfig,
  meta,
  footer,
}: {
  groups: DocGroup[];
  basePath: string;
  firstId: string;
  /** Name of the whole document, for the breadcrumb — e.g. "API & MCP reference". */
  docTitle: string;
  group: DocGroup;
  section: DocSection;
  prev: FlatSection | null;
  next: FlatSection | null;
  /** This section's own content, for "Copy page" — not the whole document. */
  markdown: string;
  /** The whole document's Markdown twin, for "View as Markdown". */
  markdownHref: string;
  /** Only the API reference offers the MCP connect actions. */
  cursorConfig?: string;
  /** Rendered only on the doc's landing page (e.g. base URLs, quick facts). */
  meta?: ReactNode;
  /** Rendered only on the doc's final page (e.g. a closing CTA). */
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:pt-12">
          <DocsNav groups={groups} basePath={basePath} firstId={firstId} activeId={section.id} />
        </aside>

        {/* One measure for everything. Capping prose but letting tables and code
            run the full column width leaves a ragged right edge and makes the
            page feel unset; a single ~70ch column keeps every element aligned. */}
        <div className="min-w-0 max-w-[46rem] pb-24 pt-10 lg:pt-12">
          {/* Its own row, always — Copy Page stays pinned to the top-right
              corner no matter how long the section title runs, instead of
              sharing a flex row with the title and getting pushed onto its
              own line when things wrap. */}
          <div className="flex items-center justify-between gap-4">
            <p className="truncate text-[13px] font-medium text-muted">
              {docTitle} <span className="mx-1 text-line">/</span> {group.title}
            </p>
            <PageActions markdown={markdown} markdownHref={markdownHref} cursorConfig={cursorConfig} />
          </div>

          <header className="mt-2 border-b border-line pb-6">
            <h1 className="text-[26px] font-extrabold tracking-tight text-ink [text-wrap:balance]">
              {section.title}
            </h1>
            {meta}
          </header>

          <div className="pt-8">
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>

          <SectionPager basePath={basePath} prev={prev} next={next} />

          {footer}
        </div>
      </div>
    </div>
  );
}
