import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { PostsListPage } from "@/components/posts-list";

export const metadata = { title: "Scheduled posts" };

export default async function ScheduledPostsPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  return (
    <div className="fade-up">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold">Scheduled</h1>
        <p className="text-sm text-muted">Queued and waiting for their departure time.</p>
      </div>
      <div className="mt-5">
        <PostsListPage user={user} workspaceId={ws.id} filter="scheduled" />
      </div>
    </div>
  );
}
