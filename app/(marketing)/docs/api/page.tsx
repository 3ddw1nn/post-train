import Link from "next/link";
import { DOCS, MCP_URL, API_BASE, docsToMarkdown } from "@/lib/docs/api-reference";
import { Block } from "./blocks";
import { DocsNav } from "./docs-nav";
import { PageActions } from "./page-actions";

export const metadata = {
  title: "API & MCP Reference",
  description:
    "REST API and Model Context Protocol server for Post Train — schedule and publish across every connected social account programmatically.",
};

export default function ApiDocsPage() {
  const markdown = docsToMarkdown();
  // Base64 on the server: `btoa` doesn't exist during SSR, and encoding this
  // in the client component would desync the server and client renders.
  const cursorConfig = Buffer.from(JSON.stringify({ url: MCP_URL })).toString("base64");

  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:pt-12">
          <DocsNav groups={DOCS} />
        </aside>

        {/* One measure for everything. Capping prose but letting tables and code
            run the full column width leaves a ragged right edge and makes the
            page feel unset; a single ~70ch column keeps every element aligned. */}
        <div className="min-w-0 max-w-[46rem] pb-24 pt-10 lg:pt-12">
          <header className="border-b border-line pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[28px] font-extrabold tracking-tight text-ink">
                  API &amp; MCP reference
                </h1>
                <p className="mt-1.5 max-w-[62ch] text-[15px] leading-relaxed text-ink/70">
                  Two ways to drive Post Train programmatically. Included with every paid
                  plan — no separate API purchase.
                </p>
              </div>
              <PageActions markdown={markdown} cursorConfig={cursorConfig} />
            </div>

            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  REST base URL
                </dt>
                <dd className="mt-0.5 font-mono text-[13px] text-ink">{API_BASE}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  MCP server
                </dt>
                <dd className="mt-0.5 font-mono text-[13px] text-ink">{MCP_URL}</dd>
              </div>
            </dl>
          </header>

          {DOCS.map((group, gi) => (
            <section key={group.id} aria-labelledby={`${group.id}-heading`}>
              <h2
                id={`${group.id}-heading`}
                // The first group sits right under the header's rule, so a full
                // mt-14 there strands two horizontal lines around a dead band.
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

          <footer className="mt-16 rounded-xl border border-line bg-page/60 p-5">
            <h2 className="text-[15px] font-bold">Something missing?</h2>
            <p className="mt-1 max-w-[60ch] text-sm text-ink/70">
              These docs cover every endpoint and tool we ship. If you need something that
              isn&apos;t here, tell us what you&apos;re building — endpoint requests from
              people actually integrating carry the most weight in what we build next.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="mailto:ehleedev@gmail.com?subject=API%20feedback" className="btn-dark">
                Email the team
              </a>
              <Link href="/dashboard/api-keys" className="btn-subtle">
                Get an API key
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
