// Post domain logic shared by the dashboard, the public API v1, and the MCP tools.
import { convexMutation, convexQuery, now, patchRecord, uid } from "./db";
import type { User } from "./auth";
import { getSubscription } from "./billing";
import { entitled, freePostsRemaining, canCreatePosts } from "./entitlements";
import { platform as platformOf, CAPTION_MAX, type PostType } from "./platforms";
import { nextQueueSlot, applyJitter, QueueError } from "./queue";
import { importFromUrl } from "./media";
import type { Workspace } from "./workspaces";
import { api } from "@/convex/_generated/api";

export class DomainError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export type PostRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  type: PostType;
  caption: string;
  status: "draft" | "scheduled" | "processing" | "posted" | "failed";
  is_draft: number;
  scheduled_at: string | null;
  used_queue: number;
  queue_timezone: string | null;
  platform_configurations: string | null;
  account_configurations: string | null;
  free_credits_used: number;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SocialAccountRow = {
  id: number;
  workspace_id: string;
  platform: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  platform_account_id?: string | null;
  status: "active" | "needs_reauth" | "disconnected";
  connected_at: string;
};

export type AccountConfig = { account_id: number; caption?: string };

export type CreatePostInput = {
  caption?: string;
  media?: string[];
  media_urls?: string[];
  social_accounts: number[];
  scheduled_at?: string | null;
  is_draft?: boolean;
  use_queue?: boolean | { timezone?: string };
  type?: PostType;
  platform_configurations?: Record<string, unknown>;
  account_configurations?: AccountConfig[] | { account_configurations: AccountConfig[] };
};

function normalizeAccountConfigs(
  input: CreatePostInput["account_configurations"]
): AccountConfig[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return input.account_configurations ?? [];
}

export async function accountsByIds(ids: number[]): Promise<SocialAccountRow[]> {
  if (ids.length === 0) return [];
  return await convexQuery<SocialAccountRow[]>(api.accounts.getMany, { ids });
}

export async function mediaKinds(mediaIds: string[]): Promise<{ id: string; kind: string }[]> {
  if (mediaIds.length === 0) return [];
  return await convexQuery<{ id: string; kind: string }[]>(api.media.getUploadedKinds, { ids: mediaIds });
}

function inferType(kinds: string[]): PostType {
  if (kinds.includes("video")) return "video";
  if (kinds.length > 0) return "image";
  return "text";
}

/**
 * Create a post. `allowedWorkspaces` scopes which accounts the caller may target
 * (session user → their workspaces; API key → its workspace).
 */
export async function createPost(
  user: User,
  allowedWorkspaces: Workspace[],
  input: CreatePostInput
): Promise<PostRow> {
  const caption = input.caption ?? "";
  if (caption.length > CAPTION_MAX) {
    throw new DomainError(400, `Caption exceeds ${CAPTION_MAX} characters.`);
  }
  if (!input.social_accounts?.length) {
    throw new DomainError(400, "At least one social account is required.");
  }
  if (input.use_queue && input.scheduled_at) {
    throw new DomainError(400, "use_queue and scheduled_at are mutually exclusive.");
  }

  const accounts = await accountsByIds(input.social_accounts);
  if (accounts.length !== input.social_accounts.length) {
    throw new DomainError(400, "One or more social accounts do not exist.");
  }
  const wsIds = new Set(accounts.map((a) => a.workspace_id));
  if (wsIds.size > 1) {
    throw new DomainError(400, "All social accounts must belong to the same workspace.");
  }
  const workspace = allowedWorkspaces.find((w) => wsIds.has(w.id));
  if (!workspace) {
    throw new DomainError(403, "You do not have access to these social accounts.");
  }

  // Resolve media (uploaded ids + server-side URL downloads)
  const mediaIds: string[] = [...(input.media ?? [])];
  for (const url of input.media_urls ?? []) {
    const row = await importFromUrl(workspace.id, url);
    mediaIds.push(row.id);
  }
  const kinds = await mediaKinds(mediaIds);
  if (kinds.length !== mediaIds.length) {
    throw new DomainError(400, "One or more media items are missing or not uploaded.");
  }
  const type: PostType = input.type ?? inferType(kinds.map((k) => k.kind));

  // Per-type platform support (spec PRD §4)
  for (const account of accounts) {
    const p = platformOf(account.platform);
    if (p && !p.supports.includes(type)) {
      throw new DomainError(400, `${p.name} does not support ${type} posts.`);
    }
  }
  if ((type === "image" || type === "story") && kinds.length === 0) {
    throw new DomainError(400, `A ${type} post needs at least one media file.`);
  }
  if (type === "video" && !kinds.some((k) => k.kind === "video")) {
    throw new DomainError(400, "A video post needs a video file.");
  }

  // Scheduling
  const isDraft = !!input.is_draft;
  let scheduledAt: string | null = null;
  let usedQueue = 0;
  let queueTz: string | null = null;
  if (!isDraft) {
    if (input.use_queue) {
      const explicitTz =
        typeof input.use_queue === "object" ? input.use_queue.timezone : undefined;
      queueTz = explicitTz || user.timezone || "UTC";
      try {
        const slot = await nextQueueSlot(workspace.id, queueTz);
        scheduledAt = applyJitter(slot, !!workspace.randomize_queue_time).toISOString();
      } catch (e) {
        if (e instanceof QueueError) throw new DomainError(400, e.message, e.code);
        throw e;
      }
      usedQueue = 1;
    } else if (input.scheduled_at) {
      const t = new Date(input.scheduled_at);
      if (isNaN(t.getTime())) throw new DomainError(400, "scheduled_at is not a valid datetime.");
      if (t.getTime() < Date.now() - 60_000) {
        throw new DomainError(400, "scheduled_at must be in the future.");
      }
      scheduledAt = t.toISOString();
    } else {
      scheduledAt = new Date().toISOString(); // instant post → picked up by the worker
    }
  }

  // Free-tier metering: each destination consumes 1 of the 5 free posts (spec FAQ),
  // charged when a post is actually scheduled (not for drafts).
  const sub = await getSubscription(user.id);
  let creditsUsed = 0;
  if (!isDraft) {
    if (!canCreatePosts(user, sub)) {
      throw new DomainError(403, "No active subscription and no free posts remaining.", "paywall");
    }
    if (!entitled(sub)) {
      if (freePostsRemaining(user) < accounts.length) {
        throw new DomainError(
          403,
          `This post needs ${accounts.length} free post credits but only ${freePostsRemaining(user)} remain. Upgrade to continue.`,
          "paywall"
        );
      }
      creditsUsed = accounts.length;
      await patchRecord("users", user.id, { free_posts_used: user.free_posts_used + creditsUsed });
    }
  }

  const id = uid();
  const ts = now();
  const accountConfigs = normalizeAccountConfigs(input.account_configurations);
  return await convexMutation<PostRow>(api.posts.createPost, {
    id,
    workspace_id: workspace.id,
    created_by: user.id,
    type,
    caption,
    status: isDraft ? "draft" : "scheduled",
    is_draft: isDraft ? 1 : 0,
    scheduled_at: scheduledAt,
    used_queue: usedQueue,
    queue_timezone: queueTz,
    platform_configurations: input.platform_configurations ? JSON.stringify(input.platform_configurations) : null,
    account_configurations: accountConfigs.length ? JSON.stringify(accountConfigs) : null,
    free_credits_used: creditsUsed,
    media_ids: mediaIds,
    destinations: accounts.map((account) => ({
      social_account_id: account.id,
      caption_override: accountConfigs.find((c) => c.account_id === account.id)?.caption ?? null,
    })),
  });
}

export async function getPostRow(id: string): Promise<PostRow | null> {
  return await convexQuery<PostRow | null>(api.posts.getPost, { id });
}

export async function postMediaIds(postId: string): Promise<string[]> {
  return await convexQuery<string[]>(api.posts.getMediaIds, { post_id: postId });
}

export async function postAccountIds(postId: string): Promise<number[]> {
  return await convexQuery<number[]>(api.posts.getAccountIds, { post_id: postId });
}

export async function serializePost(post: PostRow) {
  return {
    id: post.id,
    type: post.type,
    caption: post.caption,
    status: post.status,
    is_draft: !!post.is_draft,
    scheduled_at: post.scheduled_at,
    posted_at: post.posted_at,
    social_accounts: await postAccountIds(post.id),
    media: await postMediaIds(post.id),
    platform_configurations: post.platform_configurations
      ? JSON.parse(post.platform_configurations)
      : null,
    account_configurations: post.account_configurations
      ? JSON.parse(post.account_configurations)
      : null,
    created_at: post.created_at,
    updated_at: post.updated_at,
  };
}

export async function listPosts(
  workspaceIds: string[],
  opts: { status?: string; platform?: string; limit?: number; offset?: number } = {}
): Promise<{ data: PostRow[]; count: number }> {
  if (workspaceIds.length === 0) return { data: [], count: 0 };
  return await convexQuery<{ data: PostRow[]; count: number }>(api.posts.listPosts, {
    workspace_ids: workspaceIds,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.platform ? { platform: opts.platform } : {}),
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
}

export async function postsInRange(
  workspaceId: string,
  fromIso: string,
  toIso: string,
  platformId?: string
): Promise<PostRow[]> {
  return await convexQuery<PostRow[]>(api.posts.postsInRange, {
    workspace_id: workspaceId,
    from: fromIso,
    to: toIso,
    ...(platformId ? { platform: platformId } : {}),
  });
}

export type UpdatePostInput = Partial<
  Pick<CreatePostInput, "caption" | "media" | "social_accounts" | "platform_configurations" | "account_configurations">
> & { scheduled_at?: string | null; is_draft?: boolean };

export async function updatePost(post: PostRow, input: UpdatePostInput): Promise<PostRow> {
  if (!["draft", "scheduled"].includes(post.status)) {
    throw new DomainError(400, "Only draft or scheduled posts can be updated.");
  }
  const caption = input.caption ?? post.caption;
  if (caption.length > CAPTION_MAX) {
    throw new DomainError(400, `Caption exceeds ${CAPTION_MAX} characters.`);
  }

  let isDraft = input.is_draft ?? !!post.is_draft;
  let scheduledAt = input.scheduled_at === undefined ? post.scheduled_at : input.scheduled_at;
  if (scheduledAt) {
    const t = new Date(scheduledAt);
    if (isNaN(t.getTime())) throw new DomainError(400, "scheduled_at is not a valid datetime.");
    if (
      t.toISOString() !== post.scheduled_at &&
      t.getTime() < Date.now() - 60_000
    ) {
      throw new DomainError(400, "scheduled_at must be in the future.");
    }
    scheduledAt = t.toISOString();
  }
  if (!scheduledAt) isDraft = true; // scheduling without a time keeps it a draft (spec drafts copy)

  if (input.social_accounts) {
    const accounts = await accountsByIds(input.social_accounts);
    if (accounts.length !== input.social_accounts.length || accounts.some((a) => a.workspace_id !== post.workspace_id)) {
      throw new DomainError(400, "Social accounts must exist in the post's workspace.");
    }
    const accountConfigs = normalizeAccountConfigs(input.account_configurations).length
      ? normalizeAccountConfigs(input.account_configurations)
      : (post.account_configurations ? (JSON.parse(post.account_configurations) as AccountConfig[]) : []);
  }
  const nextDestinations = input.social_accounts
    ? (await accountsByIds(input.social_accounts)).map((account) => {
        const accountConfigs = normalizeAccountConfigs(input.account_configurations).length
          ? normalizeAccountConfigs(input.account_configurations)
          : (post.account_configurations ? (JSON.parse(post.account_configurations) as AccountConfig[]) : []);
        return {
          social_account_id: account.id,
          caption_override: accountConfigs.find((c) => c.account_id === account.id)?.caption ?? null,
        };
      })
    : undefined;
  if (input.media) {
    const kinds = await mediaKinds(input.media);
    if (kinds.length !== input.media.length) {
      throw new DomainError(400, "One or more media items are missing or not uploaded.");
    }
  }

  // ponytail: edits are not re-metered against the free quota; only the initial
  // scheduling charge applies. Upgrade path: recompute credits on destination change.
  return await convexMutation<PostRow>(api.posts.patchPost, {
    id: post.id,
    patch: {
      caption,
      is_draft: isDraft ? 1 : 0,
      status: isDraft ? "draft" : "scheduled",
      scheduled_at: scheduledAt,
      ...(input.platform_configurations !== undefined
        ? { platform_configurations: JSON.stringify(input.platform_configurations) }
        : {}),
      ...(input.account_configurations !== undefined
        ? { account_configurations: JSON.stringify(normalizeAccountConfigs(input.account_configurations)) }
        : {}),
    },
    ...(input.media ? { media_ids: input.media } : {}),
    ...(nextDestinations ? { destinations: nextDestinations } : {}),
  });
}

export async function deletePost(post: PostRow): Promise<void> {
  if (!["draft", "scheduled"].includes(post.status)) {
    throw new DomainError(400, "Published posts cannot be deleted.");
  }
  if (post.free_credits_used > 0) {
    const user = await convexQuery<User | null>(api.auth.getUserById, { id: post.created_by });
    if (user) {
      await patchRecord("users", user.id, {
        free_posts_used: Math.max(0, user.free_posts_used - post.free_credits_used),
      });
    }
  }
  await convexMutation(api.posts.deletePost, { id: post.id });
}

/** Duplicate any post into a new Draft (spec: duplicating creates a draft). */
export async function duplicatePost(post: PostRow, userId: string): Promise<PostRow> {
  const id = uid();
  const mediaIds = await postMediaIds(post.id);
  const destIds = await postAccountIds(post.id);
  const accountConfigs = post.account_configurations
    ? (JSON.parse(post.account_configurations) as AccountConfig[])
    : [];
  return await convexMutation<PostRow>(api.posts.createPost, {
    id,
    workspace_id: post.workspace_id,
    created_by: userId,
    type: post.type,
    caption: post.caption,
    status: "draft",
    is_draft: 1,
    scheduled_at: null,
    used_queue: 0,
    queue_timezone: null,
    platform_configurations: post.platform_configurations,
    account_configurations: post.account_configurations,
    free_credits_used: 0,
    media_ids: mediaIds,
    destinations: destIds.map((accountId) => ({
      social_account_id: accountId,
      caption_override: accountConfigs.find((c) => c.account_id === accountId)?.caption ?? null,
    })),
  });
}
