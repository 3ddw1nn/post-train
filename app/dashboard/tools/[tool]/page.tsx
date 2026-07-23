import Link from "next/link";
import { notFound } from "next/navigation";
import { TOOL_LIST } from "@/lib/tools-registry";
import { ToolRenderer } from "@/components/tool-renderer";
import { Icon } from "@/components/icons";

export function generateStaticParams() {
  return TOOL_LIST.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = TOOL_LIST.find((x) => x.slug === tool);
  return { title: t ? t.name : "Tool not found" };
}

export default async function DashboardToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = TOOL_LIST.find((x) => x.slug === tool);
  if (!t) notFound();

  const wide = t.slug === "trend-finder";

  const wideShell =
    "lg:relative lg:left-1/2 lg:w-[calc(100vw-var(--pt-sidebar-width,232px)-3rem)] lg:max-w-none lg:-translate-x-1/2";

  return (
    <div className={`fade-up ${wide ? wideShell : ""}`}>
      <Link href="/dashboard/tools" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={15} /> Back to tools
      </Link>

      <div className="mt-4">
        <div>
          <h1 className="text-2xl font-bold">{t.name}</h1>
          <p className="mt-1 text-sm text-muted">{t.desc}</p>
        </div>
      </div>

      {wide ? (
        <div className="mt-5 min-h-[calc(100vh-14rem)]">
          <ToolRenderer slug={t.slug} />
        </div>
      ) : (
        <div className="card mt-5 max-w-2xl p-5 md:p-6">
          <ToolRenderer slug={t.slug} />
        </div>
      )}
    </div>
  );
}
