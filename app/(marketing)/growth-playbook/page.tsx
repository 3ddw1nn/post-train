import Link from "next/link";
import { PLAYBOOK, playbookToMarkdown } from "@/lib/docs/growth-playbook";
import { DocsLayout } from "@/components/docs/docs-layout";

export const metadata = {
  title: "The Growth Playbook",
  description:
    "How to grow social accounts without burning out: pick platforms that share an asset, batch creation, automate distribution, and read analytics weekly instead of hourly.",
};

export default function GrowthPlaybookPage() {
  return (
    <DocsLayout
      groups={PLAYBOOK}
      title="The Growth Playbook"
      intro="An operating rhythm for posting across many platforms without it becoming your whole week — and where Post Train does the work for you."
      markdown={playbookToMarkdown()}
      markdownHref="/growth-playbook.md"
      footer={
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
      }
    />
  );
}
