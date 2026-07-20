import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { AvatarMenu } from "@/components/avatar-menu";
import { ChatLauncher } from "@/components/interactive";
import { StepDots } from "./step-dots";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex h-dvh flex-col bg-page-onboarding">
      <header className="shrink-0 border-b border-line bg-white">
        <div className="flex items-center justify-between px-6 py-3">
          <Link href="/" className="shrink-0">
            <Logo size={24} />
          </Link>
          <div className="shrink-0">
            <AvatarMenu name={user.display_name || user.email} />
          </div>
        </div>
        <StepDots />
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 py-10 pb-28">{children}</main>
      <ChatLauncher />
    </div>
  );
}
