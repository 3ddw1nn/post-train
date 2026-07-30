import { requireOnboardedUser } from "@/lib/auth";
import { TOOL_LIST } from "@/lib/tools-registry";
import { ToolCardGrid, type ToolCardItem } from "@/components/tool-card-grid";

export const metadata = { title: "Tools" };

const EXTRA = { slug: "growth-guide", name: "Growth guide", desc: "The full playbook for consistent, cross-platform posting.", icon: "book" };

export default async function DashboardToolsPage() {
  await requireOnboardedUser();
  const tools: ToolCardItem[] = [...TOOL_LIST, EXTRA].map((t) => ({
    ...t,
    href: t.slug === "growth-guide" ? "/growth-guide" : `/dashboard/tools/${t.slug}`,
  }));

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Tools</h1>

      <ToolCardGrid tools={tools} />
    </div>
  );
}
