import { requireOnboardedUser } from "@/lib/auth";
import { TOOL_LIST } from "@/lib/tools-registry";
import { Icon } from "@/components/icons";

export const metadata = { title: "Tools" };

const EXTRA = { slug: "growth-guide", name: "Growth guide", desc: "The full playbook for consistent, cross-platform posting.", icon: "book" };

export default async function DashboardToolsPage() {
  await requireOnboardedUser();
  const tools = [...TOOL_LIST, EXTRA];

  return (
    <div className="fade-up">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold">Tools</h1>
        <p className="text-sm text-muted">Free utilities — no login, no catch.</p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <a
            key={t.slug}
            href={`/${t.slug === "growth-guide" ? "growth-guide" : `tools/${t.slug}`}`}
            target="_blank"
            rel="noreferrer"
            className="group rounded-2xl border border-line bg-white p-5 transition-colors hover:border-primary"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-page text-primary-deep transition-colors group-hover:bg-primary-soft">
              <Icon name={t.icon} size={20} strokeWidth={1.8} />
            </span>
            <p className="mt-3 font-bold">{t.name}</p>
            <p className="mt-1 text-sm text-muted">{t.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
