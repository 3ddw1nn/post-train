import Link from "next/link";
import { DOCS, MCP_URL, API_BASE, docsToMarkdown } from "@/lib/docs/api-reference";
import { DocsLayout } from "@/components/docs/docs-layout";

export const metadata = {
  title: "API & MCP Reference",
  description:
    "REST API and Model Context Protocol server for Post Train — schedule and publish across every connected social account programmatically.",
};

export default function ApiDocsPage() {
  return (
    <DocsLayout
      groups={DOCS}
      title="API & MCP reference"
      intro="Two ways to drive Post Train programmatically. Included with every paid plan — no separate API purchase."
      markdown={docsToMarkdown()}
      markdownHref="/docs/api.md"
      // Base64 on the server: `btoa` doesn't exist during SSR, and encoding this
      // in the client component would desync the server and client renders.
      cursorConfig={Buffer.from(JSON.stringify({ url: MCP_URL })).toString("base64")}
      meta={
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
      }
      footer={
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
      }
    />
  );
}
