import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { canCreatePosts, entitled, freePostsRemaining } from "@/lib/entitlements";
import { currentWorkspace, workspacesForUser } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { getPostRow, postAccountIds, postMediaIds } from "@/lib/posts";
import type { PostType } from "@/lib/platforms";
import { PaywallCard } from "@/components/paywall-card";
import { Composer, type ComposerMedia } from "@/components/composer";

const TYPES: PostType[] = ["text", "image", "video", "story"];

export default async function ComposerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { slug } = await params;
  const { date } = await searchParams;
  const sub = getSubscription(user.id);
  const db = getDb();

  let mode: "create" | "edit" = "create";
  let type: PostType;
  let post = null;
  if (TYPES.includes(slug as PostType)) {
    type = slug as PostType;
    if (!canCreatePosts(user, sub)) return <PaywallCard />;
  } else {
    // Edit mode: /dashboard/create/{postUUID} (spec 03 D2)
    const candidate = getPostRow(slug);
    const wsIds = new Set(workspacesForUser(user.id).map((w) => w.id));
    if (!candidate || !wsIds.has(candidate.workspace_id)) notFound();
    post = candidate;
    type = candidate.type;
    mode = "edit";
  }

  const ws = post
    ? workspacesForUser(user.id).find((w) => w.id === post.workspace_id)!
    : await currentWorkspace(user);
  const accounts = accountsForWorkspace(ws.id);

  const pastCaptions = (
    db
      .prepare(
        `SELECT DISTINCT caption FROM posts WHERE workspace_id = ? AND caption != ''
         ORDER BY created_at DESC LIMIT 8`
      )
      .all(ws.id) as { caption: string }[]
  ).map((r) => r.caption);

  let initialMedia: ComposerMedia[] = [];
  if (post) {
    const ids = postMediaIds(post.id);
    if (ids.length) {
      const qs = ids.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT id, name, mime_type, kind FROM media WHERE id IN (${qs})`)
        .all(...ids) as ComposerMedia[];
      initialMedia = ids
        .map((id) => rows.find((r) => r.id === id))
        .filter(Boolean) as ComposerMedia[];
    }
  }

  return (
    <Composer
      type={type}
      mode={mode}
      accounts={accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username,
        status: a.status,
      }))}
      pastCaptions={pastCaptions}
      pref24h={!!user.pref_24h_time}
      prefFilenameCaption={!!user.pref_filename_caption}
      entitled={entitled(sub)}
      freeRemaining={freePostsRemaining(user)}
      initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
      post={
        post
          ? {
              id: post.id,
              caption: post.caption,
              status: post.status,
              is_draft: !!post.is_draft,
              scheduled_at: post.scheduled_at,
              social_accounts: postAccountIds(post.id),
              platform_configurations: post.platform_configurations
                ? JSON.parse(post.platform_configurations)
                : {},
              account_configurations: post.account_configurations
                ? JSON.parse(post.account_configurations)
                : [],
            }
          : null
      }
      initialMedia={initialMedia}
    />
  );
}
