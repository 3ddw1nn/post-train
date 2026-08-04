import { requireUser } from "@/lib/auth";
import { workspacesForUser } from "@/lib/workspaces";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { NewWorkspaceForm } from "./workspace-form";

export const metadata = { title: "Create a workspace" };

export default async function NewWorkspacePage() {
  const user = await requireUser();
  const workspaces = await workspacesForUser(user.id);

  if (workspaces.length > 0) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-dvh bg-page px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-lg flex-col justify-center sm:min-h-[calc(100dvh-5rem)]">
        <div className="mb-10">
          <Link href="/" className="inline-flex rounded-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-4" aria-label="Post Train home">
            <Logo size={28} />
          </Link>
        </div>
        <div className="border-l-2 border-primary pl-5 sm:pl-6">
          <p className="text-sm font-semibold text-primary-deep">Your workspace</p>
          <h1 className="mt-3 max-w-md text-3xl font-bold tracking-[-0.03em] text-ink sm:text-4xl">
            Start a fresh line.
          </h1>
          <p className="mt-3 max-w-md text-base leading-7 text-muted">
            You don&apos;t have a workspace right now. Create one to keep your posts, connections, and publishing schedule together.
          </p>
        </div>
        <NewWorkspaceForm />
      </div>
    </main>
  );
}
