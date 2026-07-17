import Link from "next/link";
import { TOOL_LIST } from "@/lib/tools-registry";

export const metadata = { title: "Free tools" };

export default function ToolsIndexPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-center text-3xl font-extrabold">Free tools for creators</h1>
      <p className="mt-2 text-center text-muted">
        No login, no catch — small utilities we built along the way.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOL_LIST.map((t) => (
          <Link
            key={t.slug}
            href={`/tools/${t.slug}`}
            className="card p-5 transition-colors hover:border-primary"
          >
            <p className="font-bold">{t.name}</p>
            <p className="mt-1 text-sm text-muted">{t.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
