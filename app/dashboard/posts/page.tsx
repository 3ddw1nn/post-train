import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { currentWorkspace } from "@/lib/workspaces";
import { PostsListPage } from "@/components/posts-list";
import { PostsFilters } from "@/components/posts-filters";
import { DemoPostsList, PreviewBanner } from "@/components/dashboard-preview";
import { PLATFORMS } from "@/lib/platforms";
import { PostsTabs } from "./posts-tabs";
import { PostsPendingOverlay } from "./posts-pending-overlay";

export const metadata = { title: "Posts" };

const TABS = [
  { key: "all", label: "All", subtitle: "Everything in this workspace, newest first." },
  { key: "scheduled", label: "Scheduled", subtitle: "Queued and waiting for their departure time." },
  { key: "posted", label: "Posted", subtitle: "Published posts, with per-platform results." },
  { key: "draft", label: "Drafts", subtitle: "Saved without a publish time — nothing ships yet." },
] as const;

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    type?: string;
    platform?: string;
    period?: string;
    page?: string;
  }>;
}) {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const params = await searchParams;
  const active = TABS.find((t) => t.key === params.status) ?? TABS[0];
  const hasAccess = user.is_staff || entitled(sub);
  const ws = hasAccess ? await currentWorkspace(user) : null;

  const baseParams = new URLSearchParams();
  for (const key of ["q", "sort", "type", "platform", "period"] as const) {
    if (params[key]) baseParams.set(key, params[key]!);
  }
  function tabHref(key: string) {
    const next = new URLSearchParams(baseParams);
    if (key !== "all") next.set("status", key);
    return `/dashboard/posts${next.toString() ? `?${next}` : ""}`;
  }

  return (
    <div className="fade-up">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold">Posts</h1>
        <p className="text-sm text-muted">{active.subtitle}</p>
      </div>

      {!hasAccess && <PreviewBanner feature="posts" />}

      <PostsFilters
        typeOptions={[
          { value: "all", label: "All types" },
          { value: "text", label: "Text" },
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
          { value: "story", label: "Story" },
        ]}
        platformOptions={[
          { value: "all", label: "All platforms" },
          ...PLATFORMS.map((platform) => ({ value: platform.id, label: platform.name })),
        ]}
      />

      <PostsTabs
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: tabHref(t.key) }))}
        activeKey={active.key}
      />

      <div className="relative mt-5">
        <PostsPendingOverlay />
        {hasAccess && ws ? (
          <PostsListPage
            user={user}
            workspaceId={ws.id}
            filter={active.key}
            query={{
              q: params.q ?? "",
              sort: params.sort === "oldest" ? "oldest" : "recent",
              type: params.type ?? "all",
              platform: params.platform ?? "all",
              period: params.period ?? "all",
              page: Number(params.page ?? 1),
            }}
          />
        ) : (
          <DemoPostsList filter={active.key} />
        )}
      </div>
    </div>
  );
}
