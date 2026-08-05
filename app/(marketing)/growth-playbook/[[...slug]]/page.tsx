import Link from "next/link";
import { notFound } from "next/navigation";
import { PLAYBOOK } from "@/lib/docs/growth-playbook";
import { DocsLayout } from "@/components/docs/docs-layout";
import { flattenSections, findGroupAndSection, sectionMarkdown } from "@/lib/docs/types";

const BASE_PATH = "/growth-playbook";
const FLAT = flattenSections(PLAYBOOK);
const FIRST_ID = FLAT[0].id;

export function generateStaticParams() {
  return [{ slug: [] }, ...FLAT.filter((s) => s.id !== FIRST_ID).map((s) => ({ slug: [s.id] }))];
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const id = slug?.[0] ?? FIRST_ID;
  const found = findGroupAndSection(PLAYBOOK, id);
  if (!found) return { title: "The Growth Playbook" };
  return {
    title: `${found.section.title} — The Growth Playbook`,
    description: found.section.blocks.find((b) => b.kind === "prose")?.text.replace(/[*`]/g, ""),
  };
}

export default async function GrowthPlaybookSectionPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const id = slug?.[0] ?? FIRST_ID;
  const found = findGroupAndSection(PLAYBOOK, id);
  if (!found) notFound();
  const { group, section } = found;

  const flatIndex = FLAT.findIndex((s) => s.id === id);
  const prev = flatIndex > 0 ? FLAT[flatIndex - 1] : null;
  const next = flatIndex < FLAT.length - 1 ? FLAT[flatIndex + 1] : null;
  const isLast = next === null;

  return (
    <DocsLayout
      groups={PLAYBOOK}
      basePath={BASE_PATH}
      firstId={FIRST_ID}
      docTitle="The Growth Playbook"
      group={group}
      section={section}
      prev={prev}
      next={next}
      markdown={sectionMarkdown(group, section)}
      markdownHref="/growth-playbook.md"
      // No cursorConfig — connecting an MCP client isn't the point of a
      // growth guide, so the copy menu doesn't offer it here.
      footer={
        isLast ? (
          <footer className="mt-16 rounded-xl border border-primary/20 bg-primary-soft/50 p-6">
            <h2 className="text-[17px] font-bold text-primary-dark">
              The loop runs itself once it&apos;s set up
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-primary-deep/90">
              Connect your accounts, set the slots, and the weekly rhythm above becomes about
              two hours of making things — not an hour a day of posting them.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/create-account" className="btn-primary">
                Start free
              </Link>
              <Link href="/docs/api" className="btn-subtle">
                Automate it with the API
              </Link>
            </div>
          </footer>
        ) : undefined
      }
    />
  );
}
