// @ts-nocheck
import { queryGeneric as query, mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { byLegacyId, now } from "./model";

// ponytail: founder/staff override lives here, not scattered across callers —
// every entitlement check in the app already flows through getSubscription(),
// so a staff user gets unlimited everything with one guard instead of one per call site.
export const getSubscription = query({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    const user = await byLegacyId(ctx, "users", args.user_id);
    if (user?.is_staff) {
      return {
        id: "staff-override",
        user_id: args.user_id,
        plan: "pro",
        interval: "month",
        status: "active",
        cancel_at_period_end: 0,
        trial_ends_at: null,
        current_period_end: null,
        api_addon: 1,
        api_addon_interval: "month",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        created_at: user.created_at,
        updated_at: user.created_at,
      };
    }
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .unique();
  },
});

export const findByStripeCustomer = query({
  args: { stripe_customer_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_customer", (q) => q.eq("stripe_customer_id", args.stripe_customer_id))
      .unique();
  },
});

export const upsertSubscription = mutation({
  args: {
    id: v.string(),
    user_id: v.string(),
    plan: v.string(),
    interval: v.string(),
    status: v.string(),
    cancel_at_period_end: v.number(),
    trial_ends_at: v.union(v.string(), v.null()),
    current_period_end: v.union(v.string(), v.null()),
    api_addon: v.number(),
    api_addon_interval: v.union(v.string(), v.null()),
    stripe_customer_id: v.optional(v.union(v.string(), v.null())),
    stripe_subscription_id: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .unique();
    if (existing) {
      const { id: _id, ...patch } = args; // legacy id is stable once assigned — never overwrite on update
      await ctx.db.patch(existing._id, { ...patch, updated_at: now() });
      return await ctx.db.get(existing._id);
    }
    await ctx.db.insert("subscriptions", { ...args, created_at: now(), updated_at: now() });
    return await byLegacyId(ctx, "subscriptions", args.id);
  },
});

export const patchByUser = mutation({
  args: { user_id: v.string(), patch: v.any() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .unique();
    if (!sub) return null;
    await ctx.db.patch(sub._id, { ...args.patch, updated_at: now() });
    return await ctx.db.get(sub._id);
  },
});
