import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthCard } from "@/components/auth-card";

export const metadata = { title: "Create account" };

export default async function CreateAccountPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard/create");
  return <AuthCard mode="signup" />;
}
