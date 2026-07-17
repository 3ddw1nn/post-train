import Link from "next/link";
import { notFound } from "next/navigation";
import { TOOL_LIST } from "@/lib/tools-registry";
import { ToolRenderer } from "./tool-renderer";

export function generateStaticParams() {
  return TOOL_LIST.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = TOOL_LIST.find((x) => x.slug === tool);
  return { title: t ? t.name : "Not found" };
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = TOOL_LIST.find((x) => x.slug === tool);
  if (!t) notFound();
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">{t.name}</h1>
      <p className="mt-2 text-muted">{t.desc}</p>
      <div className="card mt-8 p-6">
        <ToolRenderer slug={t.slug} />
      </div>
      <div className="card mt-8 bg-primary-soft p-6 text-center">
        <p className="font-bold text-primary-dark">
          Like free tools? You&apos;ll love the paid one.
        </p>
        <p className="mt-1 text-sm text-primary-dark/80">
          Schedule to 10 platforms from one dashboard — 7 days free.
        </p>
        <Link href="/create-account" className="btn-primary mt-3">
          Try Post Train free
        </Link>
      </div>
    </section>
  );
}
