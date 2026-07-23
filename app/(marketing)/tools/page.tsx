import { TOOL_LIST } from "@/lib/tools-registry";
import { ToolCardGrid, type ToolCardItem } from "@/components/tool-card-grid";

export const metadata = { title: "Free tools" };

export default function ToolsIndexPage() {
  const tools: ToolCardItem[] = TOOL_LIST.map((t) => ({ ...t, href: `/tools/${t.slug}` }));

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-center text-3xl font-extrabold">Free tools for creators</h1>
      <p className="mt-2 text-center text-muted">
        No login, no catch — small utilities we built along the way.
      </p>
      <ToolCardGrid tools={tools} />
    </section>
  );
}
