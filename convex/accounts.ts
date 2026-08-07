// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, nextNumericId, now } from "./model";
import { writeNotification } from "./notifications";

// Display names only, for notification copy. Kept local rather than imported
// from lib/platforms because that module pulls in the simple-icons bundle,
// which has no business running inside a Convex mutation.
const PLATFORM_NAMES: Record<string, string> = {
  twitter: "Twitter/X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  threads: "Threads",
  pinterest: "Pinterest",
  tumblr: "Tumblr",
};

// Encrypted platform credentials must never reach list/get consumers (they get
// serialized into RSC payloads and API responses). Publishing reads them via
// publish.destinationsForPost only.
const stripCredentials = ({ credentials: _credentials, ...rest }) => rest;

export const listForWorkspace = query({
  args: { workspace_id: v.string(), include_disconnected: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("social_accounts")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect();
    return accounts
      .filter((a) => args.include_disconnected || a.status !== "disconnected")
      .sort((a, b) => a.platform.localeCompare(b.platform) || a.connected_at.localeCompare(b.connected_at))
      .map(stripCredentials);
  },
});

export const getMany = query({
  args: { ids: v.array(v.number()) },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.ids.map((id) => byLegacyId(ctx, "social_accounts", id)));
    return rows.filter(Boolean).map(stripCredentials);
  },
});

export const upsertMockAccount = mutation({
  args: {
    workspace_id: v.string(),
    platform: v.string(),
    username: v.string(),
    display_name: v.union(v.string(), v.null()),
    avatar_url: v.union(v.string(), v.null()),
    platform_account_id: v.optional(v.union(v.string(), v.null())),
    credentials: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db
      .query("social_accounts")
      .withIndex("by_workspace_platform", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("platform", args.platform)
      )
      .collect()).find((a) => a.username === args.username);
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        connected_at: now(),
        display_name: args.display_name ?? existing.display_name,
        avatar_url: args.avatar_url ?? existing.avatar_url,
        ...(args.platform_account_id !== undefined ? { platform_account_id: args.platform_account_id } : {}),
        ...(args.credentials !== undefined ? { credentials: args.credentials } : {}),
      });
      return stripCredentials(await ctx.db.get(existing._id));
    }
    const id = await nextNumericId(ctx, "social_accounts");
    await ctx.db.insert("social_accounts", {
      id,
      workspace_id: args.workspace_id,
      platform: args.platform,
      username: args.username,
      display_name: args.display_name,
      avatar_url: args.avatar_url,
      platform_account_id: args.platform_account_id ?? null,
      status: "active",
      connected_at: now(),
      ...(args.credentials !== undefined ? { credentials: args.credentials } : {}),
    });
    return stripCredentials(await byLegacyId(ctx, "social_accounts", id));
  },
});

export const patchAccount = mutation({
  args: { id: v.number(), patch: v.any() },
  handler: async (ctx, args) => {
    const account = await byLegacyId(ctx, "social_accounts", args.id);
    if (!account) return null;
    await ctx.db.patch(account._id, args.patch);

    // A dead token is the quietest way to lose a week of scheduled posts:
    // every publish to this account fails until someone reconnects it. The
    // notice lives here rather than at the ~8 call sites that flip the flag,
    // so a future one can't forget it. Only on the transition, so a repeated
    // failure doesn't renotify.
    if (args.patch?.status === "needs_reauth" && account.status !== "needs_reauth") {
      const workspace = await byLegacyId(ctx, "workspaces", account.workspace_id);
      if (workspace) {
        await writeNotification(ctx, {
          user_id: workspace.owner_id,
          workspace_id: account.workspace_id,
          dedupe_key: `account-reauth:${account.id}`,
          type: "account",
          status: "error",
          title: `${PLATFORM_NAMES[account.platform] ?? account.platform} needs reconnecting`,
          message: `@${account.username} lost access, so posts to it will fail until you reconnect.`,
          href: "/dashboard/connections",
        });
      }
    }
    return stripCredentials(await ctx.db.get(account._id));
  },
});
