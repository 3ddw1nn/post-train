import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthCard } from "@/components/auth-card";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  // Authenticated users are bounced to the create hub (spec 04 guards)
  const user = await getSessionUser();
  if (user) redirect("/dashboard/create");
  return <AuthCard mode="signin" />;
}
