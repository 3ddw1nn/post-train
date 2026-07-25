// @ts-nocheck
// Only the client-facing list needs a dedicated query — it must strip the
// encrypted `credentials` field, same discipline as social_accounts in
// convex/accounts.ts. Everything else (insert/patch/delete/find-one-by-
// provider) goes through the generic helpers in convex/records.ts via
// lib/image-gen-keys.ts, since none of those need the stripping.
import { queryGeneric as query } from "convex/server";
import { v } from "convex/values";

const stripCredentials = ({ credentials: _credentials, ...rest }) => rest;

export const listForWorkspace = query({
  args: { workspace_id: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("image_gen_keys")
      .withIndex("by_workspace", (q) => q.eq("workspace_id", args.workspace_id))
      .collect();
    return rows.map(stripCredentials);
  },
});
