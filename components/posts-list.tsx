import Link from "next/link";
import { listRecords } from "@/lib/db";
import type { User } from "@/lib/auth";
import { listPosts, type PostRow } from "@/lib/posts";
import { formatInTz } from "@/lib/tz";
import { platform as platformOf } from "@/lib/platforms";
import { EmptyState, StatusPill } from "./ui";
import { AccountAvatar } from "./platform-icon";
import { Icon } from "./icons";
import { PostActions } from "./post-actions";
import { PostsListShell } from "./posts-list-shell";

const PAGE_SIZE = 8;

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
type PostQuery = {
  q: string;
  sort: "recent" | "oldest";
  type: string;
  platform: string;
  period: string;
  page: number;
};
type EnrichedPost = {
  post: PostRow;
  dests: DestRow[];
  results: ResultRow[];
  thumb: { id: string; kind: string } | null;
};

export async function PostsListPage({
  user,
  workspaceId,
  filter,
  query,
}: {
  user: User;
  workspaceId: string;
  filter: "all" | "scheduled" | "posted" | "draft";
  query: PostQuery;
}) {
  const { data } = await listPosts([workspaceId], {
    status: filter === "all" ? undefined : filter,
    limit: 1000,
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

  const enriched = data.map((post) => {
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
        return { post, dests, results, thumb: thumb ?? null };
      });

  const searched = applyPostFilters(enriched, query);
  const timeBuckets = timeBucketOptions(searched.beforePeriod, query.period);
  const pageCount = Math.max(1, Math.ceil(searched.posts.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isFinite(query.page) ? query.page : 1), pageCount);
  const pagePosts = searched.posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const groups = groupByMonth(pagePosts);

  if (searched.posts.length === 0) {
    return (
      <>
        <TimeBucketTabs buckets={timeBuckets} active={query.period} filter={filter} query={query} />
        <EmptyState
          icon="filter"
          title="No posts match those filters"
          subtitle="Try a different search, type, platform, or time range."
        />
      </>
    );
  }

  return (
    <PostsListShell>
      <TimeBucketTabs buckets={timeBuckets} active={query.period} filter={filter} query={query} />
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <h2 className="px-1 text-xs font-extrabold uppercase tracking-wide text-muted">
            {group.label}
          </h2>
          {group.items.map(({ post, dests, results, thumb }) => (
            <PostRowCard
              key={post.id}
              post={post}
              dests={dests}
              results={results}
              thumb={thumb}
              user={user}
            />
          ))}
        </section>
      ))}
      <PostsPagination page={page} pageCount={pageCount} total={searched.posts.length} filter={filter} query={query} />
    </PostsListShell>
  );
}

function applyPostFilters(posts: EnrichedPost[], query: PostQuery) {
  const q = query.q.trim().toLowerCase();
  const beforePeriod = posts
    .filter(({ post }) => query.type === "all" || post.type === query.type)
    .filter(({ dests }) => query.platform === "all" || dests.some((d) => d.platform === query.platform))
    .filter(({ post, dests, results }) => {
      if (!q) return true;
      const haystack = [
        post.caption,
        post.status,
        post.type,
        ...dests.flatMap((d) => [d.username, d.platform, platformOf(d.platform)?.name ?? ""]),
        ...results.flatMap((r) => [r.username, r.platform, r.error_message ?? ""]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

  const postsInPeriod = beforePeriod.filter(({ post }) => {
    if (!query.period || query.period === "all") return true;
    const date = postDate(post);
    if (query.period.startsWith("month:")) {
      return monthKey(date) === query.period.slice("month:".length);
    }
    if (query.period.startsWith("year:")) {
      return String(date.getFullYear()) === query.period.slice("year:".length);
    }
    return true;
  });

  const postsSorted = postsInPeriod.sort((a, b) => {
    const diff = postDate(a.post).getTime() - postDate(b.post).getTime();
    return query.sort === "oldest" ? diff : -diff;
  });

  return { beforePeriod, posts: postsSorted };
}

function postDate(post: PostRow) {
  return new Date(post.posted_at ?? post.scheduled_at ?? post.created_at);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = monthKey(date);
  if (key === thisMonth) return "This month";
  if (key === monthKey(lastMonthDate)) return "Last month";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function groupByMonth(posts: EnrichedPost[]) {
  const map = new Map<string, { key: string; label: string; items: EnrichedPost[] }>();
  for (const item of posts) {
    const date = postDate(item.post);
    const key = monthKey(date);
    if (!map.has(key)) map.set(key, { key, label: monthLabel(date), items: [] });
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values());
}

function timeBucketOptions(posts: EnrichedPost[], active: string) {
  const monthMap = new Map<string, Date>();
  const yearMap = new Map<string, Date>();
  for (const { post } of posts) {
    const date = postDate(post);
    monthMap.set(monthKey(date), new Date(date.getFullYear(), date.getMonth(), 1));
    yearMap.set(String(date.getFullYear()), new Date(date.getFullYear(), 0, 1));
  }
  const months = Array.from(monthMap.entries())
    .sort((a, b) => b[1].getTime() - a[1].getTime())
    .map(([key, date]) => ({ key: `month:${key}`, label: monthLabel(date) }));
  const years = Array.from(yearMap.entries())
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([key]) => ({ key: `year:${key}`, label: key }));
  const buckets = [{ key: "all", label: "All time" }, ...months, ...years];
  return active === "all" || buckets.some((bucket) => bucket.key === active)
    ? buckets
    : [{ key: active, label: "Selected range" }, ...buckets];
}

function postsHref(
  filter: "all" | "scheduled" | "posted" | "draft",
  query: PostQuery,
  overrides: Partial<PostQuery>
) {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (next.q.trim()) params.set("q", next.q.trim());
  if (next.sort === "oldest") params.set("sort", "oldest");
  if (next.type && next.type !== "all") params.set("type", next.type);
  if (next.platform && next.platform !== "all") params.set("platform", next.platform);
  if (next.period && next.period !== "all") params.set("period", next.period);
  if (next.page > 1) params.set("page", String(next.page));
  return `/dashboard/posts${params.toString() ? `?${params}` : ""}`;
}

function TimeBucketTabs({
  buckets,
  active,
  filter,
  query,
}: {
  buckets: { key: string; label: string }[];
  active: string;
  filter: "all" | "scheduled" | "posted" | "draft";
  query: PostQuery;
}) {
  if (buckets.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {buckets.map((bucket) => (
        <Link
          key={bucket.key}
          href={postsHref(filter, query, { period: bucket.key, page: 1 })}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
            (active || "all") === bucket.key
              ? "border-primary bg-primary-soft text-primary-deep"
              : "border-line bg-white text-muted hover:text-ink"
          }`}
        >
          {bucket.label}
        </Link>
      ))}
    </div>
  );
}

function PostsPagination({
  page,
  pageCount,
  total,
  filter,
  query,
}: {
  page: number;
  pageCount: number;
  total: number;
  filter: "all" | "scheduled" | "posted" | "draft";
  query: PostQuery;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-muted">
        Page {page} of {pageCount} · {total} posts
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          aria-disabled={page === 1}
          href={postsHref(filter, query, { page: Math.max(1, page - 1) })}
          className={`btn-subtle ${page === 1 ? "pointer-events-none opacity-50" : ""}`}
        >
          <Icon name="chevronLeft" size={14} /> Previous
        </Link>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <Link
            key={n}
            href={postsHref(filter, query, { page: n })}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-bold ${
              n === page
                ? "border-primary bg-primary text-white"
                : "border-line bg-white text-muted hover:text-ink"
            }`}
          >
            {n}
          </Link>
        ))}
        <Link
          aria-disabled={page === pageCount}
          href={postsHref(filter, query, { page: Math.min(pageCount, page + 1) })}
          className={`btn-subtle ${page === pageCount ? "pointer-events-none opacity-50" : ""}`}
        >
          Next <Icon name="chevronRight" size={14} />
        </Link>
      </div>
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
  const dateLabel = when
    ? formatInTz(when, user.timezone, { month: "short", day: "numeric" })
    : null;
  const timeLabel = when
    ? formatInTz(when, user.timezone, {
        hour: user.pref_24h_time ? "2-digit" : "numeric",
        minute: "2-digit",
        hour12: !user.pref_24h_time,
      })
    : null;

  const resultSummary =
    results.length > 0
      ? `${results.filter((r) => r.success).length}/${results.length} platforms published`
      : post.status === "scheduled"
        ? "Scheduled for publishing"
        : post.is_draft
          ? "Caption saved, no publish time yet"
          : "";

  return (
    <div className="card overflow-visible p-4">
      <div className="flex items-center gap-4">
        {thumb ? (
          thumb.kind === "video" ? (
            <video src={`/api/media-file/${thumb.id}`} className="h-14 w-14 shrink-0 rounded-lg object-cover" muted />
          ) : thumb.kind === "pdf" ? (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-page text-muted">
              <Icon name="file" size={18} />
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
            <Icon name="type" size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {post.caption || <span className="italic text-muted">No caption</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
            {resultSummary && <span className="text-xs text-muted">{resultSummary}</span>}
            {when && (
              <span className="flex items-center gap-1 text-xs text-muted lg:hidden">
                <Icon name={post.posted_at ? "send" : "clock"} size={12} /> {dateLabel},{" "}
                {timeLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill status={post.is_draft ? "draft" : post.status} />
          {when && (
            <span className="hidden items-center gap-1 text-xs text-muted lg:flex">
              <Icon name={post.posted_at ? "send" : "clock"} size={12} /> {dateLabel}, {timeLabel}
            </span>
          )}
        </div>
        <PostActions postId={post.id} caption={post.caption} editable={editable} />
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
