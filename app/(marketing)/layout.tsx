import { MarketingNav } from "./marketing-nav";
import { MarketingFooter } from "./marketing-footer";
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
      <MarketingFooter />
    </div>
  );
}
