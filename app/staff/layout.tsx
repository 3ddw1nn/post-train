import Link from "next/link";
import { requireStaffUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { StaffNav } from "@/components/interactive";

export const metadata = { title: "Staff" };

const NAV = [
  { label: "Users", href: "/staff", icon: "users" },
  { label: "Leads", href: "/staff/leads", icon: "megaphone" },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireStaffUser();

  return (
    <div className="min-h-screen bg-page">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[210px] border-r border-line bg-white lg:block">
        <nav className="flex h-full flex-col gap-4 p-4">
          <Link href="/staff">
            <Logo size={24} />
          </Link>
          <div>
            <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted">
              <Icon name="shield" size={12} /> Staff
            </p>
            <StaffNav items={NAV} />
          </div>
        </nav>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:left-[210px]">
        <Link href="/staff" className="flex items-center gap-2 font-bold lg:hidden">
          <Logo size={20} />
        </Link>
        <Link
          href="/dashboard/create"
          className="btn-subtle ml-auto"
        >
          Exit Staff Mode
        </Link>
      </header>

      <div className="pt-14 lg:pl-[210px]">
        <main className="mx-auto max-w-5xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
