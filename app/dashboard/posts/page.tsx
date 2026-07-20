import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { PostsListPage } from "@/components/posts-list";

export const metadata = { title: "All posts" };

export default async function AllPostsPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  return (
    <div className="fade-up">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold">All posts</h1>
        <p className="text-sm text-muted">Everything in this workspace, newest first.</p>
      </div>
      <div className="mt-5">
        <PostsListPage user={user} workspaceId={ws.id} filter="all" />
      </div>
    </div>
  );
}
