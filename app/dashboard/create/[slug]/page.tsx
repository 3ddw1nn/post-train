import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { canCreatePosts, entitled } from "@/lib/entitlements";
import { currentWorkspace, workspacesForUser } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { listRecords } from "@/lib/db";
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
  searchParams: Promise<{ date?: string; media?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { slug } = await params;
  const { date, media: mediaParam } = await searchParams;
  const sub = await getSubscription(user.id);

  let mode: "create" | "edit" = "create";
  let type: PostType;
  let post = null;
  if (TYPES.includes(slug as PostType)) {
    type = slug as PostType;
    if (!canCreatePosts(sub, user)) return <PaywallCard />;
  } else {
    // Edit mode: /dashboard/create/{postUUID} (spec 03 D2)
    const candidate = await getPostRow(slug);
    const wsIds = new Set((await workspacesForUser(user.id)).map((w) => w.id));
    if (!candidate || !wsIds.has(candidate.workspace_id)) notFound();
    post = candidate;
    type = candidate.type;
    mode = "edit";
    if (!canCreatePosts(sub, user)) return <PaywallCard />;
  }

  const ws = post
    ? (await workspacesForUser(user.id)).find((w) => w.id === post.workspace_id)!
    : await currentWorkspace(user);
  const accounts = await accountsForWorkspace(ws.id);

  const pastCaptions = [
    ...new Set(
      (await listRecords<{ caption: string; created_at: string }>("posts", { workspace_id: ws.id }))
        .filter((p) => p.caption)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => p.caption)
    ),
  ].slice(0, 8);

  let initialMedia: ComposerMedia[] = [];
  if (!post && mediaParam) {
    // Prefill from e.g. a finished Content Studio render — a single id
    // (?media=<id>) for video templates, or a comma-separated list
    // (?media=<id1>,<id2>,...) for multi-image templates like slideshow.
    const ids = mediaParam.split(",").filter(Boolean);
    const rows = (
      await listRecords<ComposerMedia & { workspace_id: string; upload_status: string }>("media")
    ).filter((m) => ids.includes(m.id) && m.workspace_id === ws.id && m.upload_status === "uploaded");
    initialMedia = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as ComposerMedia[];
  }
  if (post) {
    const ids = await postMediaIds(post.id);
    if (ids.length) {
      const rows = (await listRecords<ComposerMedia>("media")).filter((m) => ids.includes(m.id));
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
        avatar_url: a.avatar_url,
      }))}
      pastCaptions={pastCaptions}
      pref24h={!!user.pref_24h_time}
      prefFilenameCaption={!!user.pref_filename_caption}
      entitled={entitled(sub)}
      freeRemaining={0}
      initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
      post={
        post
          ? {
              id: post.id,
              caption: post.caption,
              status: post.status,
              is_draft: !!post.is_draft,
              scheduled_at: post.scheduled_at,
              social_accounts: await postAccountIds(post.id),
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
