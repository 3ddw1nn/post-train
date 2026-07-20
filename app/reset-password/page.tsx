import { AuthShell } from "@/components/auth-card";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell>
      <div className="card overflow-hidden">
        <div aria-hidden className="h-1 bg-primary" />
        <div className="p-8">
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <div className="mt-6">
            <ResetForm token={token ?? ""} />
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
