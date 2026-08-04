import { redirect } from "next/navigation";

/** The dashboard shell's natural landing view is the composer. */
export default function DashboardIndexPage() {
  redirect("/dashboard/create");
}
