import Link from "next/link";
import { listRecords } from "@/lib/db";
import type { User } from "@/lib/auth";
import { listPosts, type PostRow } from "@/lib/posts";
import { formatInTz } from "@/lib/tz";
import { platform as platformOf } from "@/lib/platforms";
import { EmptyState, StatusPill } from "./ui";
import { AccountAvatar } from "./platform-icon";
import { Icon } from "./icons";
import { ActionButton, Dropdown } from "./interactive";

const EMPTY: Record<string, { title: string; subtitle: React.ReactNode }> = {
  all: { title: "No posts", subtitle: "Get started by creating a post" },
  scheduled: { title: "No scheduled posts", subtitle: "Get started by creating a post" },
  posted: { title: "No posts", subtitle: "Get started by creating a post" },
  draft: {
    title: "No draft posts",
    subtitle:
      "Drafts appear when you schedule a post without a time, or when you duplicate a post.",
  },
};

type DestRow = {
  social_account_id: number;
  username: string;
  platform: string;
  avatar_url: string | null;
};
type ResultRow = {
  platform: string;
  success: number;
  share_url: string | null;
  error_message: string | null;
  username: string;
};

export async function PostsListPage({
  user,
  workspaceId,
  filter,
}: {
  user: User;
  workspaceId: string;
  filter: "all" | "scheduled" | "posted" | "draft";
}) {
  const { data } = await listPosts([workspaceId], {
    status: filter === "all" ? undefined : filter,
    limit: 100,
  });

  if (data.length === 0) {
    const e = EMPTY[filter];
    return (
      <EmptyState
        title={e.title}
        subtitle={e.subtitle}
        cta={{ label: "Create Post", href: "/dashboard/create" }}
      />
    );
  }

  const [destRows, accounts, resultRows, mediaLinks, mediaRows] = await Promise.all([
    listRecords<{ post_id: string; social_account_id: number }>("post_destinations"),
    listRecords<{ id: number; username: string; platform: string; avatar_url: string | null }>("social_accounts"),
    listRecords<ResultRow & { post_id: string; social_account_id: number }>("post_results"),
    listRecords<{ post_id: string; media_id: string; sort_order: number }>("post_media"),
    listRecords<{ id: string; kind: string }>("media"),
  ]);

  return (
    <div className="flex flex-col gap-3">
      {data.map((post) => {
        const dests = destRows
          .filter((d) => d.post_id === post.id)
          .map((d) => {
            const account = accounts.find((a) => a.id === d.social_account_id);
            return account
              ? {
                  social_account_id: d.social_account_id,
                  username: account.username,
                  platform: account.platform,
                  avatar_url: account.avatar_url,
                }
              : null;
          })
          .filter(Boolean) as DestRow[];
        const results =
          post.status === "posted" || post.status === "failed"
            ? resultRows
                .filter((r) => r.post_id === post.id)
                .map((r) => ({
                  platform: r.platform,
                  success: r.success,
                  share_url: r.share_url,
                  error_message: r.error_message,
                  username: accounts.find((a) => a.id === r.social_account_id)?.username ?? "",
                }))
            : [];
        const firstLink = mediaLinks
          .filter((m) => m.post_id === post.id)
          .sort((a, b) => a.sort_order - b.sort_order)[0];
        const thumb = firstLink ? mediaRows.find((m) => m.id === firstLink.media_id) : undefined;
        return (
          <PostRowCard
            key={post.id}
            post={post}
            dests={dests}
            results={results}
            thumb={thumb ?? null}
            user={user}
          />
        );
      })}
    </div>
  );
}

function PostRowCard({
  post,
  dests,
  results,
  thumb,
  user,
}: {
  post: PostRow;
  dests: DestRow[];
  results: ResultRow[];
  thumb: { id: string; kind: string } | null;
  user: User;
}) {
  const editable = ["draft", "scheduled"].includes(post.status);
  const when = post.posted_at ?? post.scheduled_at;
  const whenLabel = when
    ? formatInTz(when, user.timezone, {
        month: "short",
        day: "numeric",
        hour: user.pref_24h_time ? "2-digit" : "numeric",
        minute: "2-digit",
        hour12: !user.pref_24h_time,
      })
    : "—";

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        {thumb ? (
          thumb.kind === "video" ? (
            <video src={`/api/media-file/${thumb.id}`} className="h-14 w-14 shrink-0 rounded-lg object-cover" muted />
          ) : thumb.kind === "pdf" ? (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-page text-muted">
              <Icon name="file" size={20} />
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media-file/${thumb.id}`}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          )
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-page text-muted">
            <Icon name="type" size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {post.caption || <span className="italic text-muted">No caption</span>}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {dests.slice(0, 6).map((d) => (
              <span key={d.social_account_id} title={`@${d.username} · ${platformOf(d.platform)?.name}`}>
                <AccountAvatar
                  username={d.username}
                  platformId={d.platform}
                  avatarUrl={d.avatar_url}
                  size={24}
                />
              </span>
            ))}
            {dests.length > 6 && (
              <span className="text-xs text-muted">+{dests.length - 6} more</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill status={post.is_draft ? "draft" : post.status} />
          <span className="flex items-center gap-1 text-xs text-muted">
            <Icon name={post.posted_at ? "send" : "clock"} size={12} /> {whenLabel}
          </span>
        </div>
        <Dropdown
          align="right"
          width={190}
          trigger={
            <button type="button" aria-label="Post actions" className="btn-subtle !px-2 !py-1.5">
              <Icon name="dots" size={16} strokeWidth={2.5} />
            </button>
          }
        >
          <Link
            href={`/dashboard/create/${post.id}`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
          >
            <Icon name={editable ? "pencil" : "eye"} size={14} /> {editable ? "Edit" : "View"}
          </Link>
          <ActionButton
            endpoint={`/api/app/posts/${post.id}/duplicate`}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
          >
            <Icon name="copy" size={14} /> Duplicate
          </ActionButton>
          {editable && (
            <ActionButton
              endpoint={`/api/app/posts/${post.id}`}
              method="DELETE"
              confirmText="Delete this post?"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-danger hover:bg-red-50"
            >
              <Icon name="trash" size={14} /> Delete
            </ActionButton>
          )}
        </Dropdown>
      </div>

      {results.length > 0 && (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-bold text-muted hover:text-ink">
            Per-platform results ({results.filter((r) => r.success).length}/{results.length}{" "}
            succeeded)
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${r.success ? "bg-primary" : "bg-danger"}`}
                />
                <span className="font-semibold">{platformOf(r.platform)?.name}</span>
                <span className="text-muted">@{r.username}</span>
                {r.success && r.share_url ? (
                  <a
                    href={r.share_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary-deep hover:underline"
                  >
                    View post <Icon name="external" size={11} />
                  </a>
                ) : (
                  <span className="ml-auto text-xs text-danger">{r.error_message}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
