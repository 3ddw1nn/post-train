// @ts-nocheck
// Explore ("viral content library") queries. Global/shared tables — see
// convex/schema.ts's explore_items comment for why there's no workspace_id.
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

const slideValidator = v.object({ image_url: v.string(), text: v.string() });

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("explore_items").order("desc").take(100);
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => await byLegacyId(ctx, "explore_items", args.id),
});

export const listSlides = query({
  args: { explore_item_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("explore_item_slides")
      .withIndex("by_item", (q) => q.eq("explore_item_id", args.explore_item_id))
      .order("asc")
      .take(20);
  },
});

export const seedSampleItems = mutation({
  args: {
    items: v.array(
      v.object({
        id: v.string(),
        platform: v.string(),
        category: v.string(),
        media_type: v.string(),
        cover_image_url: v.string(),
        slides: v.array(slideValidator),
        caption: v.string(),
        hashtags: v.array(v.string()),
        creator_handle: v.string(),
        creator_avatar_url: v.union(v.string(), v.null()),
        source_url: v.string(),
        view_count: v.number(),
        like_count: v.number(),
        comment_count: v.number(),
        share_count: v.number(),
        save_count: v.number(),
        is_monetized: v.number(),
        posted_at: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("explore_items").take(1);
    if (existing.length > 0) return { inserted: 0, skipped: args.items.length };
    for (const { slides, ...item } of args.items) {
      await ctx.db.insert("explore_items", { ...item, slide_count: slides.length, created_at: now() });
      for (let i = 0; i < slides.length; i++) {
        await ctx.db.insert("explore_item_slides", {
          explore_item_id: item.id,
          sort_order: i,
          image_url: slides[i].image_url,
          text: slides[i].text,
        });
      }
    }
    return { inserted: args.items.length, skipped: 0 };
  },
});
