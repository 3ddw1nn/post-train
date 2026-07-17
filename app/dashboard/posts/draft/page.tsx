import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { PostsListPage } from "@/components/posts-list";

export const metadata = { title: "Drafts" };

export default async function DraftsPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Drafts</h1>
      <div className="mt-5">
        <PostsListPage user={user} workspaceId={ws.id} filter="draft" />
      </div>
    </div>
  );
}
