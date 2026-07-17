import Link from "next/link";
import { PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icon";

export const metadata = { title: "MCP — manage social from your AI" };

const TOOLS = [
  ["list_social_accounts", "See every connected account and its id"],
  ["create_post", "Draft, schedule or queue posts — media by URL, no upload step"],
  ["list_posts / get_post", "Browse and inspect posts by status"],
  ["update_post / delete_post", "Edit or remove anything not yet published"],
  ["list_post_results", "Per-platform success/failure with share links"],
  ["list_analytics / sync_analytics", "Pull TikTok/YouTube/Instagram metrics"],
];

export default function McpPage() {
  return (
    <>
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Manage your social media from your AI
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
          Post Train ships a Model Context Protocol server. Connect Claude, Cursor or any
          MCP client and post everywhere by asking nicely.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          {PLATFORMS.map((p) => (
            <PlatformIcon key={p.id} id={p.id} size={20} />
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-page py-14">
        <div className="mx-auto max-w-2xl px-6">
          <div className="card p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              A conversation, not a dashboard
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <p className="ml-auto max-w-xs rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 font-medium text-[#0c2e1a]">
                Schedule this demo video to all my accounts for tomorrow morning
              </p>
              <p className="max-w-sm rounded-2xl rounded-bl-sm bg-page px-4 py-2.5">
                Done — queued to 6 accounts for tomorrow 9:00 AM. Want a draft on TikTok
                instead so you can review the cover first?
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-extrabold">Three-step setup</h2>
        <ol className="mt-6 flex flex-col gap-3">
          {[
            "Enable the API add-on and create a key under Dashboard → API Keys.",
            "Add the MCP server to your client: URL {your-host}/api/mcp/mcp, header Authorization: Bearer pt_live_….",
            "Ask your AI to list your accounts — then start posting.",
          ].map((s, i) => (
            <li key={i} className="card flex items-start gap-3 p-4 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-[#0c2e1a]">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <h2 className="mt-14 text-center text-2xl font-extrabold">11 tools, full control</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {TOOLS.map(([name, desc]) => (
            <div key={name} className="card p-4">
              <code className="text-sm font-bold text-primary-deep">{name}</code>
              <p className="mt-1 text-sm text-muted">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/create-account" className="btn-primary !px-8 !py-3">
            Try it for free
          </Link>
        </div>
      </section>
    </>
  );
}
