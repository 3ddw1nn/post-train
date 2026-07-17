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
    <div className="flex min-h-screen flex-col bg-page-onboarding">
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <Link href="/">
          <Logo size={24} />
        </Link>
        <StepDots />
        <AvatarMenu name={user.display_name || user.email} />
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 pb-28">{children}</main>
      <ChatLauncher />
    </div>
  );
}
