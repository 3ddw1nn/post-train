// @ts-nocheck
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";
import { decideNotification } from "./notificationRules";

/**
 * Write-or-update one notification, keyed by `dedupe_key`.
 *
 * Every producer goes through here. The rule that makes the inbox usable is
 * that a long-running thing owns ONE row for its whole lifetime — a render
 * that goes rendering → ready must not leave two entries behind — so the key
 * is the identity of the *thing*, not of the event.
 *
 * When the visible content changes, `read_at`/`toast_shown_at` are cleared so
 * the update surfaces again: "your render finished" is worth a second toast
 * even if you already dismissed "your render started". An unchanged write is
 * a no-op, so a worker re-tick can't re-toast the same state.
 */
export async function writeNotification(
  ctx,
  input: {
    user_id: string;
    workspace_id: string;
    dedupe_key: string;
    type: string;
    status: string;
    title: string;
    message: string;
    href: string | null;
  },
) {
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_user_id_and_dedupe_key", (q) =>
      q.eq("user_id", input.user_id).eq("dedupe_key", input.dedupe_key),
    )
    .unique();
  const timestamp = now();
  const decision = decideNotification(existing, input);
  if (decision.action === "skip") return existing;
  if (decision.action === "patch") {
    await ctx.db.patch(existing._id, { ...decision.patch, updated_at: timestamp });
    return await ctx.db.get(existing._id);
  }
  const id = await ctx.db.insert("notifications", {
    id: `ntf_${input.dedupe_key}`,
    ...input,
    read_at: null,
    toast_shown_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return await ctx.db.get(id);
}

export const listForUser = query({
  args: { user_id: v.string(), workspace_id: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit)));
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_workspace_id", (q) =>
        q.eq("user_id", args.user_id).eq("workspace_id", args.workspace_id),
      )
      .order("desc")
      .take(limit);
  },
});

export const upsert = mutation({
  args: {
    id: v.string(),
    user_id: v.string(),
    workspace_id: v.string(),
    dedupe_key: v.string(),
    type: v.string(),
    status: v.string(),
    title: v.string(),
    message: v.string(),
    href: v.union(v.string(), v.null()),
  },
  // `id` is accepted for call-site symmetry with the other tables but ignored:
  // dedupe_key is this table's real identity.
  handler: async (ctx, args) => await writeNotification(ctx, args),
});

export const markRead = mutation({
  args: { id: v.string(), user_id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "notifications", args.id);
    if (!row || row.user_id !== args.user_id) return false;
    if (!row.read_at) await ctx.db.patch(row._id, { read_at: now() });
    return true;
  },
});

export const markToastShown = mutation({
  args: { items: v.array(v.object({ id: v.string(), updated_at: v.string() })), user_id: v.string() },
  handler: async (ctx, args) => {
    const timestamp = now();
    for (const item of args.items.slice(0, 20)) {
      const row = await byLegacyId(ctx, "notifications", item.id);
      // Do not let an acknowledgement for the processing toast suppress a
      // success/failure update that landed between the client's GET and PATCH.
      if (row?.user_id === args.user_id && row.updated_at === item.updated_at && !row.toast_shown_at) {
        await ctx.db.patch(row._id, { toast_shown_at: timestamp });
      }
    }
    return true;
  },
});

export const dismiss = mutation({
  args: { id: v.string(), user_id: v.string() },
  handler: async (ctx, args) => {
    const row = await byLegacyId(ctx, "notifications", args.id);
    if (!row || row.user_id !== args.user_id) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

export const markAllRead = mutation({
  args: { user_id: v.string(), workspace_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_workspace_id", (q) =>
        q.eq("user_id", args.user_id).eq("workspace_id", args.workspace_id),
      )
      .order("desc")
      .take(50);
    const timestamp = now();
    for (const row of rows) if (!row.read_at) await ctx.db.patch(row._id, { read_at: timestamp });
    return true;
  },
});
