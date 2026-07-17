// Post domain logic shared by the dashboard, the public API v1, and the MCP tools.
import { getDb, now, uid } from "./db";
import type { User } from "./auth";
import { getSubscription } from "./billing";
import { entitled, freePostsRemaining, canCreatePosts } from "./entitlements";
import { platform as platformOf, CAPTION_MAX, type PostType } from "./platforms";
import { nextQueueSlot, applyJitter, QueueError } from "./queue";
import { importFromUrl } from "./media";
import type { Workspace } from "./workspaces";

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

export function accountsByIds(ids: number[]): SocialAccountRow[] {
  if (ids.length === 0) return [];
  const qs = ids.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT * FROM social_accounts WHERE id IN (${qs})`)
    .all(...ids) as SocialAccountRow[];
}

export function mediaKinds(mediaIds: string[]): { id: string; kind: string }[] {
  if (mediaIds.length === 0) return [];
  const qs = mediaIds.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT id, kind FROM media WHERE id IN (${qs}) AND upload_status = 'uploaded'`)
    .all(...mediaIds) as { id: string; kind: string }[];
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
  const db = getDb();
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

  const accounts = accountsByIds(input.social_accounts);
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
  const kinds = mediaKinds(mediaIds);
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
        const slot = nextQueueSlot(workspace.id, queueTz);
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
  const sub = getSubscription(user.id);
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
      db.prepare("UPDATE users SET free_posts_used = free_posts_used + ? WHERE id = ?").run(
        creditsUsed,
        user.id
      );
    }
  }

  const id = uid();
  const ts = now();
  const accountConfigs = normalizeAccountConfigs(input.account_configurations);
  db.prepare(
    `INSERT INTO posts (id, workspace_id, created_by, type, caption, status, is_draft, scheduled_at,
      used_queue, queue_timezone, platform_configurations, account_configurations, free_credits_used, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspace.id,
    user.id,
    type,
    caption,
    isDraft ? "draft" : "scheduled",
    isDraft ? 1 : 0,
    scheduledAt,
    usedQueue,
    queueTz,
    input.platform_configurations ? JSON.stringify(input.platform_configurations) : null,
    accountConfigs.length ? JSON.stringify(accountConfigs) : null,
    creditsUsed,
    ts,
    ts
  );
  const insertMedia = db.prepare(
    "INSERT INTO post_media (post_id, media_id, sort_order) VALUES (?, ?, ?)"
  );
  mediaIds.forEach((m, i) => insertMedia.run(id, m, i));
  const insertDest = db.prepare(
    "INSERT INTO post_destinations (post_id, social_account_id, caption_override) VALUES (?, ?, ?)"
  );
  for (const account of accounts) {
    const override = accountConfigs.find((c) => c.account_id === account.id)?.caption ?? null;
    insertDest.run(id, account.id, override);
  }
  return getPostRow(id)!;
}

export function getPostRow(id: string): PostRow | null {
  return (getDb().prepare("SELECT * FROM posts WHERE id = ?").get(id) ?? null) as PostRow | null;
}

export function postMediaIds(postId: string): string[] {
  return (
    getDb()
      .prepare("SELECT media_id FROM post_media WHERE post_id = ? ORDER BY sort_order")
      .all(postId) as { media_id: string }[]
  ).map((r) => r.media_id);
}

export function postAccountIds(postId: string): number[] {
  return (
    getDb()
      .prepare("SELECT social_account_id FROM post_destinations WHERE post_id = ?")
      .all(postId) as { social_account_id: number }[]
  ).map((r) => r.social_account_id);
}

export function serializePost(post: PostRow) {
  return {
    id: post.id,
    type: post.type,
    caption: post.caption,
    status: post.status,
    is_draft: !!post.is_draft,
    scheduled_at: post.scheduled_at,
    posted_at: post.posted_at,
    social_accounts: postAccountIds(post.id),
    media: postMediaIds(post.id),
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

export function listPosts(
  workspaceIds: string[],
  opts: { status?: string; platform?: string; limit?: number; offset?: number } = {}
): { data: PostRow[]; count: number } {
  if (workspaceIds.length === 0) return { data: [], count: 0 };
  const db = getDb();
  const where: string[] = [`p.workspace_id IN (${workspaceIds.map(() => "?").join(",")})`];
  const params: (string | number)[] = [...workspaceIds];
  if (opts.status) {
    // API alias: published == posted
    const status = opts.status === "published" ? "posted" : opts.status;
    if (status === "draft") {
      where.push("p.is_draft = 1");
    } else {
      where.push("p.status = ? AND p.is_draft = 0");
      params.push(status);
    }
  }
  if (opts.platform) {
    where.push(
      `EXISTS (SELECT 1 FROM post_destinations d JOIN social_accounts a ON a.id = d.social_account_id
        WHERE d.post_id = p.id AND a.platform = ?)`
    );
    params.push(opts.platform);
  }
  const whereSql = where.join(" AND ");
  const count = (
    db.prepare(`SELECT COUNT(*) c FROM posts p WHERE ${whereSql}`).get(...params) as { c: number }
  ).c;
  const data = db
    .prepare(
      `SELECT p.* FROM posts p WHERE ${whereSql}
       ORDER BY COALESCE(p.scheduled_at, p.created_at) DESC LIMIT ? OFFSET ?`
    )
    .all(...params, opts.limit ?? 50, opts.offset ?? 0) as PostRow[];
  return { data, count };
}

export function postsInRange(
  workspaceId: string,
  fromIso: string,
  toIso: string,
  platformId?: string
): PostRow[] {
  const where: string[] = [
    "workspace_id = ?",
    "is_draft = 0",
    "COALESCE(scheduled_at, posted_at) >= ?",
    "COALESCE(scheduled_at, posted_at) < ?",
  ];
  const params: (string | number)[] = [workspaceId, fromIso, toIso];
  if (platformId) {
    where.push(
      `EXISTS (SELECT 1 FROM post_destinations d JOIN social_accounts a ON a.id = d.social_account_id
        WHERE d.post_id = posts.id AND a.platform = ?)`
    );
    params.push(platformId);
  }
  return getDb()
    .prepare(`SELECT * FROM posts WHERE ${where.join(" AND ")} ORDER BY scheduled_at`)
    .all(...params) as PostRow[];
}

export type UpdatePostInput = Partial<
  Pick<CreatePostInput, "caption" | "media" | "social_accounts" | "platform_configurations" | "account_configurations">
> & { scheduled_at?: string | null; is_draft?: boolean };

export function updatePost(post: PostRow, input: UpdatePostInput): PostRow {
  if (!["draft", "scheduled"].includes(post.status)) {
    throw new DomainError(400, "Only draft or scheduled posts can be updated.");
  }
  const db = getDb();
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
    const accounts = accountsByIds(input.social_accounts);
    if (accounts.length !== input.social_accounts.length || accounts.some((a) => a.workspace_id !== post.workspace_id)) {
      throw new DomainError(400, "Social accounts must exist in the post's workspace.");
    }
    const accountConfigs = normalizeAccountConfigs(input.account_configurations).length
      ? normalizeAccountConfigs(input.account_configurations)
      : (post.account_configurations ? (JSON.parse(post.account_configurations) as AccountConfig[]) : []);
    db.prepare("DELETE FROM post_destinations WHERE post_id = ?").run(post.id);
    const insertDest = db.prepare(
      "INSERT INTO post_destinations (post_id, social_account_id, caption_override) VALUES (?, ?, ?)"
    );
    for (const account of accounts) {
      const override = accountConfigs.find((c) => c.account_id === account.id)?.caption ?? null;
      insertDest.run(post.id, account.id, override);
    }
  }
  if (input.media) {
    const kinds = mediaKinds(input.media);
    if (kinds.length !== input.media.length) {
      throw new DomainError(400, "One or more media items are missing or not uploaded.");
    }
    db.prepare("DELETE FROM post_media WHERE post_id = ?").run(post.id);
    const insertMedia = db.prepare(
      "INSERT INTO post_media (post_id, media_id, sort_order) VALUES (?, ?, ?)"
    );
    input.media.forEach((m, i) => insertMedia.run(post.id, m, i));
  }

  // ponytail: edits are not re-metered against the free quota; only the initial
  // scheduling charge applies. Upgrade path: recompute credits on destination change.
  db.prepare(
    `UPDATE posts SET caption = ?, is_draft = ?, status = ?, scheduled_at = ?,
      platform_configurations = COALESCE(?, platform_configurations),
      account_configurations = COALESCE(?, account_configurations),
      updated_at = ? WHERE id = ?`
  ).run(
    caption,
    isDraft ? 1 : 0,
    isDraft ? "draft" : "scheduled",
    scheduledAt,
    input.platform_configurations !== undefined
      ? JSON.stringify(input.platform_configurations)
      : null,
    input.account_configurations !== undefined
      ? JSON.stringify(normalizeAccountConfigs(input.account_configurations))
      : null,
    now(),
    post.id
  );
  return getPostRow(post.id)!;
}

export function deletePost(post: PostRow): void {
  if (!["draft", "scheduled"].includes(post.status)) {
    throw new DomainError(400, "Published posts cannot be deleted.");
  }
  const db = getDb();
  if (post.free_credits_used > 0) {
    db.prepare(
      "UPDATE users SET free_posts_used = MAX(0, free_posts_used - ?) WHERE id = ?"
    ).run(post.free_credits_used, post.created_by);
  }
  db.prepare("DELETE FROM post_destinations WHERE post_id = ?").run(post.id);
  db.prepare("DELETE FROM post_media WHERE post_id = ?").run(post.id);
  db.prepare("DELETE FROM post_results WHERE post_id = ?").run(post.id);
  db.prepare("DELETE FROM posts WHERE id = ?").run(post.id);
}

/** Duplicate any post into a new Draft (spec: duplicating creates a draft). */
export function duplicatePost(post: PostRow, userId: string): PostRow {
  const db = getDb();
  const id = uid();
  const ts = now();
  db.prepare(
    `INSERT INTO posts (id, workspace_id, created_by, type, caption, status, is_draft, scheduled_at,
      used_queue, queue_timezone, platform_configurations, account_configurations, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', 1, NULL, 0, NULL, ?, ?, ?, ?)`
  ).run(
    id,
    post.workspace_id,
    userId,
    post.type,
    post.caption,
    post.platform_configurations,
    post.account_configurations,
    ts,
    ts
  );
  const insertMedia = db.prepare(
    "INSERT INTO post_media (post_id, media_id, sort_order) VALUES (?, ?, ?)"
  );
  postMediaIds(post.id).forEach((m, i) => insertMedia.run(id, m, i));
  const insertDest = db.prepare(
    "INSERT INTO post_destinations (post_id, social_account_id, caption_override) VALUES (?, ?, ?)"
  );
  const dests = db
    .prepare("SELECT social_account_id, caption_override FROM post_destinations WHERE post_id = ?")
    .all(post.id) as { social_account_id: number; caption_override: string | null }[];
  for (const d of dests) insertDest.run(id, d.social_account_id, d.caption_override);
  return getPostRow(id)!;
}
