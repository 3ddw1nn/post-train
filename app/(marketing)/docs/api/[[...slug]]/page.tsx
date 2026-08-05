import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, MCP_URL, API_BASE } from "@/lib/docs/api-reference";
import { DocsLayout } from "@/components/docs/docs-layout";
import { flattenSections, findGroupAndSection, sectionMarkdown } from "@/lib/docs/types";

const BASE_PATH = "/docs/api";
const FLAT = flattenSections(DOCS);
const FIRST_ID = FLAT[0].id;

export function generateStaticParams() {
  // The first section renders at the bare base path (no slug) — see
  // sectionHref in lib/docs/types.ts — so it's the only one excluded here.
  return [{ slug: [] }, ...FLAT.filter((s) => s.id !== FIRST_ID).map((s) => ({ slug: [s.id] }))];
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const id = slug?.[0] ?? FIRST_ID;
  const found = findGroupAndSection(DOCS, id);
  if (!found) return { title: "API & MCP Reference" };
  return {
    title: `${found.section.title} — API & MCP Reference`,
    description: found.section.blocks.find((b) => b.kind === "prose")?.text.replace(/[*`]/g, ""),
  };
}

export default async function ApiDocsSectionPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const id = slug?.[0] ?? FIRST_ID;
  const found = findGroupAndSection(DOCS, id);
  if (!found) notFound();
  const { group, section } = found;

  const flatIndex = FLAT.findIndex((s) => s.id === id);
  const prev = flatIndex > 0 ? FLAT[flatIndex - 1] : null;
  const next = flatIndex < FLAT.length - 1 ? FLAT[flatIndex + 1] : null;
  const isFirst = id === FIRST_ID;
  const isLast = next === null;

  return (
    <DocsLayout
      groups={DOCS}
      basePath={BASE_PATH}
      firstId={FIRST_ID}
      docTitle="API & MCP reference"
      group={group}
      section={section}
      prev={prev}
      next={next}
      markdown={sectionMarkdown(group, section)}
      markdownHref="/docs/api.md"
      // Only offer MCP client-connect actions from the section that's actually
      // about connecting one — elsewhere it's noise in the copy menu.
      cursorConfig={
        id === "mcp-connect"
          ? Buffer.from(JSON.stringify({ url: MCP_URL })).toString("base64")
          : undefined
      }
      meta={
        isFirst ? (
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
        ) : undefined
      }
      footer={
        isLast ? (
          <footer className="mt-16 rounded-xl border border-line bg-page/60 p-5">
            <h2 className="text-[15px] font-bold">Something missing?</h2>
            <p className="mt-1 text-sm text-ink/70">
              These docs cover every endpoint and tool we ship. If you need something that
              isn&apos;t here, tell us what you&apos;re building — endpoint requests from people
              actually integrating carry the most weight in what we build next.
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
        ) : undefined
      }
    />
  );
}
