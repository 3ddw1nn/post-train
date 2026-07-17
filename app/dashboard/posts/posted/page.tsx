import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { PostsListPage } from "@/components/posts-list";

export const metadata = { title: "Posted" };

export default async function PostedPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Posted</h1>
      <div className="mt-5">
        <PostsListPage user={user} workspaceId={ws.id} filter="posted" />
      </div>
    </div>
  );
}
