import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

export default defineSchema({
  users: defineTable({
    id: v.string(),
    email: v.string(),
    password_hash: nullableString,
    display_name: v.string(),
    avatar_url: nullableString,
    persona: nullableString,
    onboarded_at: nullableString,
    timezone: v.string(),
    pref_24h_time: v.number(),
    pref_filename_caption: v.number(),
    pref_server_video_processing: v.number(),
    email_automation: v.number(),
    email_failure_alerts: v.number(),
    email_post_summary: v.number(),
    weekly_posting_goal: v.number(),
    free_posts_used: v.number(),
    upsell_dismissed: v.number(),
    first_subscribed_at: nullableString,
    session_epoch: v.number(),
    is_staff: v.optional(v.number()),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_email", ["email"]),

  workspaces: defineTable({
    id: v.string(),
    owner_id: v.string(),
    name: v.string(),
    randomize_queue_time: v.number(),
    webhook_url: nullableString,
    webhook_secret: v.string(),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_owner", ["owner_id"]),

  workspace_members: defineTable({
    workspace_id: v.string(),
    user_id: v.string(),
    role: v.string(),
    created_at: v.string(),
  })
    .index("by_workspace", ["workspace_id"])
    .index("by_user", ["user_id"])
    .index("by_workspace_user", ["workspace_id", "user_id"]),

  subscriptions: defineTable({
    id: v.string(),
    user_id: v.string(),
    plan: v.string(),
    interval: v.string(),
    status: v.string(),
    cancel_at_period_end: v.number(),
    trial_ends_at: nullableString,
    current_period_end: nullableString,
    api_addon: v.number(),
    api_addon_interval: nullableString,
    stripe_customer_id: v.optional(nullableString),
    stripe_subscription_id: v.optional(nullableString),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_user", ["user_id"])
    .index("by_stripe_customer", ["stripe_customer_id"]),

  social_accounts: defineTable({
    id: v.number(),
    workspace_id: v.string(),
    platform: v.string(),
    username: v.string(),
    display_name: nullableString,
    avatar_url: nullableString,
    platform_account_id: nullableString,
    status: v.string(),
    connected_at: v.string(),
    // AES-256-GCM-encrypted JSON of platform auth (e.g. Bluesky app password).
    // Never returned by list/get queries — only publish.destinationsForPost.
    credentials: v.optional(nullableString),
  })
    .index("by_legacy_id", ["id"])
    .index("by_workspace", ["workspace_id"])
    .index("by_workspace_platform", ["workspace_id", "platform"]),

  media: defineTable({
    id: v.string(),
    workspace_id: v.string(),
    name: v.string(),
    mime_type: v.string(),
    size_bytes: v.number(),
    kind: v.string(),
    duration_s: nullableNumber,
    width: nullableNumber,
    height: nullableNumber,
    upload_status: v.string(),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_workspace", ["workspace_id"])
    .index("by_workspace_status", ["workspace_id", "upload_status"]),

  posts: defineTable({
    id: v.string(),
    workspace_id: v.string(),
    created_by: v.string(),
    type: v.string(),
    caption: v.string(),
    status: v.string(),
    is_draft: v.number(),
    scheduled_at: nullableString,
    used_queue: v.number(),
    queue_timezone: nullableString,
    platform_configurations: nullableString,
    account_configurations: nullableString,
    free_credits_used: v.number(),
    posted_at: nullableString,
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_workspace", ["workspace_id"])
    .index("by_workspace_status", ["workspace_id", "status"])
    .index("by_due", ["status", "is_draft", "scheduled_at"]),

  post_media: defineTable({
    post_id: v.string(),
    media_id: v.string(),
    sort_order: v.number(),
  })
    .index("by_post", ["post_id"])
    .index("by_media", ["media_id"]),

  post_destinations: defineTable({
    id: v.number(),
    post_id: v.string(),
    social_account_id: v.number(),
    caption_override: nullableString,
    status: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_post", ["post_id"])
    .index("by_account", ["social_account_id"]),

  post_results: defineTable({
    id: v.string(),
    post_id: v.string(),
    social_account_id: v.number(),
    platform: v.string(),
    success: v.number(),
    platform_post_id: nullableString,
    share_url: nullableString,
    error_code: nullableString,
    error_message: nullableString,
    completed_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_post", ["post_id"]),

  analytics_records: defineTable({
    id: v.string(),
    post_result_id: v.string(),
    workspace_id: v.string(),
    platform: v.string(),
    platform_post_id: nullableString,
    view_count: v.number(),
    like_count: v.number(),
    comment_count: v.number(),
    share_count: v.number(),
    cover_image_url: nullableString,
    share_url: nullableString,
    video_description: nullableString,
    duration: nullableNumber,
    platform_created_at: nullableString,
    last_synced_at: nullableString,
    match_confidence: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_result", ["post_result_id"])
    .index("by_workspace", ["workspace_id"])
    .index("by_workspace_platform", ["workspace_id", "platform"]),

  queue_slots: defineTable({
    id: v.number(),
    workspace_id: v.string(),
    time_local: v.string(),
    days: v.string(),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_workspace", ["workspace_id"]),

  // Content Studio render/generation jobs (grid-2x2 | fade-in | ai-ugc),
  // driven by the in-process worker (lib/studio.ts state machine).
  studio_jobs: defineTable({
    id: v.string(),
    workspace_id: v.string(),
    created_by: v.string(),
    template: v.string(), // grid-2x2 | fade-in | ai-ugc
    status: v.string(), // queued | generating | compositing | done | failed
    params: v.string(), // JSON: media_ids/caption/persona/script/cta_media_id/aspect_ratio
    provider: nullableString, // creatify | fal | null (pure-ffmpeg templates)
    provider_job_id: nullableString,
    provider_video_url: nullableString,
    output_media_id: nullableString,
    output_media_ids: v.optional(nullableString), // JSON string[] — multi-output templates (e.g. slideshow)
    error_message: nullableString,
    attempts: v.number(),
    lease_until: nullableString,
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_workspace", ["workspace_id"])
    .index("by_status", ["status"]),

  // Curated "trending post" library shown on the Explore page. Global/shared
  // across all workspaces (like support_messages) — not workspace-scoped.
  // v1 is seeded with original placeholder content; a real ingestion source
  // can populate this same shape later with no UI changes.
  explore_items: defineTable({
    id: v.string(),
    platform: v.string(), // "tiktok" | "instagram"
    category: v.string(),
    media_type: v.string(), // "video" | "slideshow"
    cover_image_url: v.string(),
    slide_count: v.number(), // denormalized from explore_item_slides, for grid card badges
    caption: v.string(),
    hashtags: v.array(v.string()), // small fixed list per post, not unbounded growth
    creator_handle: v.string(),
    creator_avatar_url: nullableString,
    source_url: v.string(),
    view_count: v.number(),
    like_count: v.number(),
    comment_count: v.number(),
    share_count: v.number(),
    save_count: v.number(),
    is_monetized: v.number(),
    posted_at: v.string(),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_category", ["category"])
    .index("by_platform", ["platform"]),

  // Per-slide images/text for slideshow-type explore_items — a separate
  // table (not an inline array) since slide counts can grow per Convex
  // schema guidance, mirroring the post_media join-table pattern above.
  explore_item_slides: defineTable({
    explore_item_id: v.string(),
    sort_order: v.number(),
    image_url: v.string(),
    text: v.string(),
  }).index("by_item", ["explore_item_id"]),

  api_keys: defineTable({
    id: v.string(),
    workspace_id: v.string(),
    name: v.string(),
    key_prefix: v.string(),
    key_hash: v.string(),
    last4: v.string(),
    last_used_at: nullableString,
    created_at: v.string(),
    revoked_at: nullableString,
  })
    .index("by_legacy_id", ["id"])
    .index("by_hash", ["key_hash"])
    .index("by_workspace", ["workspace_id"]),

  teams: defineTable({
    id: v.string(),
    name: v.string(),
    creator_id: v.string(),
    workspace_id: v.string(),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_workspace", ["workspace_id"])
    .index("by_creator", ["creator_id"]),

  team_members: defineTable({
    id: v.number(),
    team_id: v.string(),
    user_id: nullableString,
    email_invited: v.string(),
    status: v.string(),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_team", ["team_id"])
    .index("by_team_email", ["team_id", "email_invited"]),

  connected_apps: defineTable({
    id: v.string(),
    user_id: v.string(),
    app_name: v.string(),
    scopes: nullableString,
    created_at: v.string(),
  }).index("by_user", ["user_id"]),

  webhook_deliveries: defineTable({
    id: v.string(),
    workspace_id: v.string(),
    event: v.string(),
    payload: v.string(),
    status: v.string(),
    attempts: v.number(),
    created_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_workspace", ["workspace_id"]),

  emails_outbox: defineTable({
    id: v.string(),
    user_id: v.string(),
    kind: v.string(),
    subject: v.string(),
    body: v.string(),
    created_at: v.string(),
  }).index("by_user", ["user_id"]),

  feedback: defineTable({
    id: v.string(),
    user_id: v.string(),
    body: v.string(),
    created_at: v.string(),
  }).index("by_user", ["user_id"]),

  password_resets: defineTable({
    token: v.string(),
    user_id: v.string(),
    expires_at: v.string(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["user_id"]),

  // One rolling conversation per session_key — "user:<id>" for signed-in app
  // users, "anon:<uuid>" for anonymous marketing-site visitors.
  support_messages: defineTable({
    session_key: v.string(),
    role: v.string(), // "user" | "assistant"
    content: v.string(),
    status: v.string(), // "pending" | "complete" | "error"
    provider: nullableString,
  }).index("by_session", ["session_key"]),

  // AI "summarize & plan to recreate" output for a Trend Finder item. Cached
  // globally by content_key — generated once, reused for every future viewer.
  trend_recreations: defineTable({
    content_key: v.string(), // the trend item id, e.g. "youtube-<id>" / "bluesky-<uri>"
    status: v.string(), // "pending" | "complete" | "error"
    summary: v.string(),
    plan: v.string(),
    provider: nullableString,
    title: v.string(),
    platform: v.string(),
  }).index("by_content_key", ["content_key"]),

  leads: defineTable({
    id: v.string(),
    name: v.string(),
    email: v.string(),
    phone: nullableString,
    company: nullableString,
    message: nullableString,
    status: v.string(), // new | contacted | qualified | unqualified | converted | lost
    source: nullableString,
    page_path: nullableString,
    referrer: nullableString,
    session_key: nullableString,
    notes: nullableString,
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_legacy_id", ["id"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),
});
