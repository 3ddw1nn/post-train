import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export function LegalDocument({
  eyebrow,
  title,
  summary,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  sections: LegalSection[];
}) {
  return (
    <article className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="max-w-3xl border-l-2 border-primary pl-5 sm:pl-6">
        <p className="text-sm font-semibold text-primary-deep">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.035em] text-ink sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{summary}</p>
        <p className="mt-5 text-xs font-semibold text-muted">Effective August 4, 2026</p>
      </header>

      <div className="mt-12 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">On this page</p>
          <nav aria-label={`${title} table of contents`} className="mt-3 flex gap-1 overflow-x-auto pb-2 lg:max-h-[calc(100vh-10rem)] lg:flex-col lg:overflow-y-auto lg:pb-0">
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="group flex shrink-0 items-baseline gap-2 border-l border-transparent px-2 py-2 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-primary-deep focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 lg:shrink"
              >
                <span className="text-xs tabular-nums text-primary/75">{String(index + 1).padStart(2, "0")}</span>
                <span>{section.title}</span>
              </a>
            ))}
          </nav>
        </aside>

        <div
          tabIndex={0}
          className="border-y border-line bg-white px-5 py-7 outline-none focus:ring-2 focus:ring-primary focus:ring-inset sm:px-8 sm:py-10 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto"
        >
          <div className="mx-auto max-w-3xl">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 border-b border-line py-8 first:pt-0 last:border-0 last:pb-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-bold tabular-nums text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <h2 className="text-xl font-bold tracking-[-0.02em] text-ink">{section.title}</h2>
                </div>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-ink/80">{section.content}</div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
