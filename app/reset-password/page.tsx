import Link from "next/link";
import { Logo } from "@/components/logo";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-page-onboarding px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex justify-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <h1 className="mt-6 text-center text-xl font-bold">Reset your password</h1>
        <div className="mt-6">
          <ResetForm token={token ?? ""} />
        </div>
      </div>
    </main>
  );
}
