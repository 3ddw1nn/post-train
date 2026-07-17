import Link from "next/link";

export const metadata = { title: "AI agents" };

export default function AgentsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-center text-4xl font-extrabold tracking-tight">
        Built for the agent era
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-lg text-muted">
        Whatever runs your automations — Claude, custom scripts, cron jobs — Post Train
        gives it a clean posting surface: REST API, MCP server and signed webhooks.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ["REST API", "Byte-simple JSON endpoints with Bearer keys.", "/docs/api"],
          ["MCP server", "11 tools any MCP client can call.", "/mcp"],
          ["Webhooks", "HMAC-SHA256 signed results on every publish.", "/docs/api"],
        ].map(([title, desc, href]) => (
          <Link key={title} href={href} className="card p-5 hover:border-primary">
            <p className="font-bold">{title}</p>
            <p className="mt-1 text-sm text-muted">{desc}</p>
          </Link>
        ))}
      </div>
      <div className="card mt-10 p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Automation etiquette
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
          <li>· Don&apos;t post identical content to multiple accounts on the same platform.</li>
          <li>· Prefer drafts for anything a human should review first.</li>
          <li>· Never automate fake engagement — platforms ban for it, and they should.</li>
        </ul>
      </div>
      <div className="mt-10 text-center">
        <Link href="/create-account" className="btn-primary !px-8 !py-3">
          Try it for free
        </Link>
      </div>
    </section>
  );
}
