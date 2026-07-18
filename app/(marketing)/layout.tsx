import Link from "next/link";
import { Logo } from "@/components/logo";
import { PLATFORMS } from "@/lib/platforms";
import { MarketingNav } from "./marketing-nav";
import { TOOL_LIST } from "@/lib/tools-registry";
import { ChatLauncher } from "@/components/interactive";
import { getSessionUser } from "@/lib/auth";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <div className="bg-white text-ink">
      <MarketingNav
        user={user ? { name: user.display_name || user.email, isStaff: !!user.is_staff } : null}
      />
      <main>{children}</main>
      <ChatLauncher variant="marketing" />
      <footer className="border-t border-line bg-page">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo size={24} />
            <p className="mt-3 max-w-52 text-sm text-muted">
              Post everywhere in one trip. Upload once, publish to 10 platforms.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Links</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li><a href="mailto:ehleedev@gmail.com" className="hover:underline">Support</a></li>
              <li><Link href="/#pricing" className="hover:underline">Pricing</Link></li>
              <li><Link href="/blog" className="hover:underline">Blog</Link></li>
              <li><Link href="/affiliates" className="hover:underline">Affiliates</Link></li>
              <li><Link href="/dashboard/settings/billing" className="hover:underline">Billing</Link></li>
              <li><Link href="/agents" className="hover:underline">AI Agents</Link></li>
              <li><Link href="/mcp" className="hover:underline">MCP</Link></li>
              <li><Link href="/docs/api" className="hover:underline">API Docs</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Platforms</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {PLATFORMS.map((p) => (
                <li key={p.id}>
                  <Link href={`/${p.slug}`} className="hover:underline">
                    {p.name} scheduler
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Free tools</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {TOOL_LIST.map((t) => (
                <li key={t.slug}>
                  <Link href={`/tools/${t.slug}`} className="hover:underline">
                    {t.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/growth-guide" className="hover:underline">
                  Growth guide
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line py-5 text-center text-xs text-muted">
          <p>
            © {new Date().getFullYear()} Post Train ·{" "}
            <Link href="/tos" className="hover:underline">Terms of Service</Link> ·{" "}
            <Link href="/privacy-policy" className="hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
