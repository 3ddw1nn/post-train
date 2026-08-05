// Single source of truth for the developer docs.
//
// The page, the /docs/api.md export, and the "copy page as Markdown" button all
// render from this one structure. Authoring the docs as data instead of JSX is
// what keeps those three honest: a hand-maintained Markdown twin drifts from
// the rendered page within a release or two, and an LLM reading the stale twin
// is worse than one reading nothing.
//
// Prose supports a deliberately tiny inline subset — `code`, **bold**, and
// [links](url) — because anything more means shipping a Markdown parser to the
// client for content we control at author time.

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type DocBlock =
  | { kind: "prose"; text: string }
  | { kind: "code"; lang: string; label?: string; code: string }
  | { kind: "note"; tone: "info" | "warn"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | {
      kind: "endpoint";
      method: Method;
      path: string;
      summary: string;
      scope?: string;
      params?: { name: string; type: string; required?: boolean; desc: string }[];
      request?: string;
      response?: string;
    };

export type DocSection = {
  id: string;
  title: string;
  /** Rendered as a nested nav entry under its parent group. */
  blocks: DocBlock[];
};

export type DocGroup = {
  id: string;
  title: string;
  sections: DocSection[];
};

export const API_BASE = "https://posttrain.app/api/v1";
export const MCP_URL = "https://posttrain.app/api/mcp";

export const DOCS: DocGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    sections: [
      {
        id: "introduction",
        title: "Introduction",
        blocks: [
          {
            kind: "prose",
            text: "Post Train exposes two programmatic surfaces over the same engine that powers the dashboard: a **REST API** for scripts, backends, and CI, and an **MCP server** for AI agents like Claude. Anything you can schedule by hand you can schedule over either one.",
          },
          {
            kind: "prose",
            text: "Both are included with every paid plan — Creator, Growth, and Pro. There is no separate API purchase.",
          },
          {
            kind: "table",
            headers: ["Surface", "Base URL", "Auth"],
            rows: [
              ["REST API v1", `${API_BASE}`, "`Bearer pt_live_…` API key"],
              ["MCP server", `${MCP_URL}`, "OAuth 2.1, or the same API key"],
            ],
          },
        ],
      },
      {
        id: "authentication",
        title: "Authentication",
        blocks: [
          {
            kind: "prose",
            text: "Create a key under **Dashboard → API Keys**. Keys are workspace-scoped, shown once at creation, and stored only as a SHA-256 hash — we cannot recover one for you, so rotate rather than retrieve.",
          },
          {
            kind: "code",
            lang: "bash",
            label: "Every request",
            code: `curl ${API_BASE}/social-accounts \\
  -H "Authorization: Bearer pt_live_your_key_here"`,
          },
          {
            kind: "note",
            tone: "warn",
            text: "A key can publish to every connected account in its workspace. Treat it like a password: server-side only, never in a browser bundle or a public repo.",
          },
        ],
      },
      {
        id: "errors",
        title: "Errors & rate limits",
        blocks: [
          {
            kind: "prose",
            text: "Errors return a JSON body shaped `{ \"error\": { \"message\": \"…\" } }` with a conventional status code.",
          },
          {
            kind: "table",
            headers: ["Status", "Meaning"],
            rows: [
              ["`400`", "Validation failed — the message names the offending field."],
              ["`401`", "Missing, malformed, or revoked credentials."],
              ["`403`", "Authenticated, but the plan or OAuth scope doesn't allow it."],
              ["`404`", "No such resource in this workspace."],
              ["`429`", "Rate limited. Retry after the current minute rolls over."],
            ],
          },
          {
            kind: "prose",
            text: "Rate limits are counted per credential per minute and scale with your plan, so heavy automation is a reason to move up a tier rather than a wall everyone shares.",
          },
          {
            kind: "table",
            headers: ["Plan", "Requests / minute"],
            rows: [
              ["Creator", "60"],
              ["Growth", "300"],
              ["Pro", "1,000"],
            ],
          },
        ],
      },
      {
        id: "pagination",
        title: "Pagination",
        blocks: [
          {
            kind: "prose",
            text: "List endpoints accept `limit` (default 50) and `offset`, and return the total as `count` alongside `data`.",
          },
          {
            kind: "code",
            lang: "bash",
            code: `curl "${API_BASE}/posts?limit=25&offset=50" \\
  -H "Authorization: Bearer pt_live_…"`,
          },
        ],
      },
    ],
  },
  {
    id: "endpoints",
    title: "REST API",
    sections: [
      {
        id: "social-accounts",
        title: "Social accounts",
        blocks: [
          {
            kind: "endpoint",
            method: "GET",
            path: "/v1/social-accounts",
            summary:
              "List connected accounts. Their numeric ids are what you pass to social_accounts when creating a post.",
            response: `{
  "data": [
    { "id": 1, "platform": "twitter", "username": "yourhandle" },
    { "id": 2, "platform": "tiktok",  "username": "yourhandle" }
  ],
  "count": 2
}`,
          },
        ],
      },
      {
        id: "media",
        title: "Media",
        blocks: [
          {
            kind: "prose",
            text: "Uploads are three steps: reserve a signed URL, `PUT` the raw bytes to it, then confirm. If your file is already reachable at a public URL, skip all of this and pass `media_urls` when creating the post — we fetch it server-side.",
          },
          {
            kind: "endpoint",
            method: "POST",
            path: "/v1/media/create-upload-url",
            summary: "Reserve a signed upload URL.",
            params: [
              { name: "mime_type", type: "string", required: true, desc: "e.g. video/mp4, image/jpeg." },
              { name: "size_bytes", type: "integer", required: true, desc: "Exact byte length. Must match the upload." },
              { name: "name", type: "string", desc: "Original filename, used for the library listing." },
            ],
            request: `{ "mime_type": "video/mp4", "size_bytes": 1048576, "name": "launch.mp4" }`,
            response: `201 → {
  "media_id": "mid_abc123",
  "upload_url": "https://…signed…",
  "complete_url": "https://…"
}`,
          },
          {
            kind: "code",
            lang: "bash",
            label: "Steps 2 and 3",
            code: `curl -X PUT "$UPLOAD_URL" \\
  -H "Content-Type: video/mp4" \\
  --data-binary @launch.mp4

curl -X POST "$COMPLETE_URL" \\
  -H "Authorization: Bearer pt_live_…"`,
          },
          {
            kind: "endpoint",
            method: "GET",
            path: "/v1/media",
            summary: "List uploaded media in the workspace.",
          },
          {
            kind: "endpoint",
            method: "DELETE",
            path: "/v1/media/{media_id}",
            summary: "Delete a media item. Media still referenced by a scheduled post is kept.",
          },
        ],
      },
      {
        id: "posts",
        title: "Posts",
        blocks: [
          {
            kind: "endpoint",
            method: "POST",
            path: "/v1/posts",
            summary:
              "Create a post. Omit both scheduled_at and use_queue to publish immediately; they are mutually exclusive.",
            params: [
              { name: "social_accounts", type: "number[]", required: true, desc: "Account ids to publish to." },
              { name: "caption", type: "string", desc: "Shared caption. Per-platform overrides win where set." },
              { name: "media", type: "string[]", desc: "Media ids from the upload flow." },
              { name: "media_urls", type: "string[]", desc: "Public URLs, downloaded server-side." },
              { name: "scheduled_at", type: "ISO 8601", desc: "Future timestamp. Timezone priority: explicit > profile > UTC." },
              { name: "use_queue", type: "boolean", desc: "Drop into the next free queue slot instead of a fixed time." },
              { name: "is_draft", type: "boolean", desc: "Save without scheduling." },
              { name: "platform_configurations", type: "object", desc: "Per-platform options, keyed by platform id." },
              { name: "account_configurations", type: "object[]", desc: "Per-account overrides, keyed by account_id." },
            ],
            request: `{
  "caption": "shipping day 🚂 #buildinpublic",
  "media_urls": ["https://cdn.example.com/launch.mp4"],
  "social_accounts": [1, 2, 3],
  "scheduled_at": "2026-09-01T14:00:00Z",
  "platform_configurations": {
    "tiktok":    { "draft": true, "video_cover_timestamp_ms": 3000, "is_aigc": true },
    "instagram": { "is_trial_reel": true, "trial_graduation": "SS_PERFORMANCE" },
    "youtube":   { "title": "My Short Title" },
    "pinterest": { "title": "Pin Title", "link": "https://…", "board_ids": ["b1"] }
  },
  "account_configurations": [
    { "account_id": 1, "caption": "a different caption for this one account" }
  ]
}`,
            response: `201 → { "id": "uuid", "status": "scheduled", "scheduled_at": "2026-09-01T14:00:00Z", … }`,
          },
          {
            kind: "endpoint",
            method: "GET",
            path: "/v1/posts",
            summary: "List posts, newest first.",
            params: [
              { name: "status", type: "string", desc: "scheduled · published · failed · draft" },
              { name: "platform", type: "string", desc: "Filter to one platform, e.g. instagram." },
              { name: "limit", type: "integer", desc: "Default 50." },
              { name: "offset", type: "integer", desc: "Default 0." },
            ],
          },
          {
            kind: "endpoint",
            method: "GET",
            path: "/v1/posts/{post_id}",
            summary: "Full post detail, including per-platform configuration.",
          },
          {
            kind: "endpoint",
            method: "PATCH",
            path: "/v1/posts/{post_id}",
            summary:
              "Update a scheduled or draft post. Only the fields you send change. Published posts are immutable.",
          },
          {
            kind: "endpoint",
            method: "DELETE",
            path: "/v1/posts/{post_id}",
            summary: "Delete a scheduled or draft post. Published posts cannot be deleted.",
          },
        ],
      },
      {
        id: "results",
        title: "Publish results",
        blocks: [
          {
            kind: "endpoint",
            method: "GET",
            path: "/v1/post-results",
            summary:
              "Per-platform outcome for one post — a share URL on success, an error message on failure. A post can partially succeed.",
            params: [{ name: "post_id", type: "string", required: true, desc: "The post to report on." }],
            response: `{
  "data": [
    { "platform": "tiktok",  "success": true,  "share_url": "https://tiktok.com/@you/video/…" },
    { "platform": "youtube", "success": false, "error_message": "Video too long for Shorts." }
  ],
  "count": 2
}`,
          },
        ],
      },
      {
        id: "analytics",
        title: "Analytics",
        blocks: [
          {
            kind: "note",
            tone: "info",
            text: "Analytics covers TikTok, YouTube, and Instagram, and requires a Creator, Growth, or Pro plan.",
          },
          {
            kind: "endpoint",
            method: "GET",
            path: "/v1/analytics",
            summary: "Metrics per published post: views, likes, comments, shares, and match_confidence.",
            params: [
              { name: "platform", type: "string", desc: "tiktok · youtube · instagram" },
              { name: "timeframe", type: "string", desc: "7d · 30d · 90d · all" },
            ],
          },
          {
            kind: "endpoint",
            method: "POST",
            path: "/v1/analytics/sync",
            summary: "Kick off a background metrics refresh. Omit platform to sync all three.",
            response: `202 → { "triggered": [ { "platform": "tiktok", "runId": "run_…" } ] }`,
          },
        ],
      },
      {
        id: "webhooks",
        title: "Webhooks",
        blocks: [
          {
            kind: "prose",
            text: "Set one URL per workspace under **Dashboard → API Keys**. Every time a post finishes we POST the per-platform results, signed with your workspace secret.",
          },
          {
            kind: "code",
            lang: "http",
            label: "Delivery",
            code: `POST {your_url}
X-Signature: hex(hmac_sha256(workspace_secret, raw_request_body))

{
  "event": "post.completed",
  "post_id": "uuid",
  "results": [
    { "platform": "tiktok",  "success": true,  "share_url": "…" },
    { "platform": "youtube", "success": false, "error": "…" }
  ]
}`,
          },
          {
            kind: "note",
            tone: "warn",
            text: "Verify the signature against the **raw** request body before parsing it. Re-serializing the JSON first changes the bytes and the HMAC will never match.",
          },
        ],
      },
    ],
  },
  {
    id: "mcp",
    title: "MCP server",
    sections: [
      {
        id: "mcp-overview",
        title: "Overview",
        blocks: [
          {
            kind: "prose",
            text: `Post Train ships a streamable-HTTP [Model Context Protocol](https://modelcontextprotocol.io) server at \`${MCP_URL}\`, exposing 11 tools that mirror this API. Connect Claude and schedule by asking rather than by writing requests.`,
          },
          {
            kind: "prose",
            text: "Unlike the create-only beta APIs some tools ship behind their MCP, every tool here is the same code path the dashboard uses — you can read, edit, delete, and pull metrics, not just create.",
          },
        ],
      },
      {
        id: "mcp-connect",
        title: "Connecting a client",
        blocks: [
          {
            kind: "prose",
            text: "**In Claude**, add a custom connector with the URL below. There is no key to paste: Claude registers itself, sends you to Post Train to sign in, and you choose what to grant.",
          },
          { kind: "code", lang: "text", label: "Connector URL", code: MCP_URL },
          {
            kind: "code",
            lang: "bash",
            label: "Claude Code",
            code: `claude mcp add --transport http posttrain ${MCP_URL}`,
          },
          {
            kind: "prose",
            text: "**Scripts and CI** can skip the browser flow entirely and send an API key to the same endpoint:",
          },
          {
            kind: "code",
            lang: "bash",
            code: `curl -X POST ${MCP_URL} \\
  -H "Authorization: Bearer pt_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
          },
        ],
      },
      {
        id: "mcp-scopes",
        title: "Scopes & consent",
        blocks: [
          {
            kind: "prose",
            text: "You approve a scope when you connect, and a client only ever sees the tools its grant covers — a read-only connection has no publish tools to call by mistake.",
          },
          {
            kind: "table",
            headers: ["Scope", "Grants", "Tools"],
            rows: [
              ["`read`", "View posts, accounts, media, analytics", "6"],
              ["`publish`", "Create, update, delete, sync", "5"],
            ],
          },
          {
            kind: "prose",
            text: "Revoke any connected app from **Dashboard → API Keys → Connected apps**. Revocation kills the refresh token immediately; the client's current access token stops working within the hour.",
          },
        ],
      },
      {
        id: "mcp-tools",
        title: "Tool reference",
        blocks: [
          {
            kind: "table",
            headers: ["Tool", "Scope", "Description"],
            rows: [
              ["`list_social_accounts`", "`read`", "Connected accounts and their ids"],
              ["`list_posts`", "`read`", "Browse posts by status or platform"],
              ["`get_post`", "`read`", "Full detail for one post"],
              ["`list_post_results`", "`read`", "Per-platform outcome with share links"],
              ["`list_media`", "`read`", "Media in the workspace"],
              ["`list_analytics`", "`read`", "TikTok / YouTube / Instagram metrics"],
              ["`create_post`", "`publish`", "Draft, schedule, or queue — media by URL"],
              ["`update_post`", "`publish`", "Edit anything not yet published"],
              ["`delete_post`", "`publish`", "Remove a scheduled or draft post"],
              ["`delete_media`", "`publish`", "Delete a media item"],
              ["`sync_analytics`", "`publish`", "Trigger a metrics refresh"],
            ],
          },
        ],
      },
      {
        id: "mcp-oauth",
        title: "OAuth details",
        blocks: [
          {
            kind: "prose",
            text: "For anyone building their own MCP client: the server implements the MCP authorization spec, so a conforming client needs no Post-Train-specific code.",
          },
          {
            kind: "table",
            headers: ["Capability", "Endpoint"],
            rows: [
              ["Protected resource metadata (RFC 9728)", "`/.well-known/oauth-protected-resource`"],
              ["Authorization server metadata (RFC 8414)", "`/.well-known/oauth-authorization-server`"],
              ["Dynamic client registration (RFC 7591)", "`/api/oauth/mcp/register`"],
              ["Authorization", "`/oauth/authorize`"],
              ["Token", "`/api/oauth/mcp/token`"],
              ["Revocation (RFC 7009)", "`/api/oauth/mcp/revoke`"],
            ],
          },
          {
            kind: "prose",
            text: "PKCE is mandatory and `S256` is the only accepted method. Tokens are bound to a resource indicator (RFC 8707) and validated on every request, so a token minted for another server is rejected here even if it is otherwise valid. Refresh tokens rotate on use.",
          },
        ],
      },
    ],
  },
];

// ── Markdown rendering ──────────────────────────────────────────────────────
// Consumed by /docs/api.md and the "copy page" button. Kept plain — no HTML,
// no front matter — because the audience is a model pasting it into context.

function endpointMarkdown(b: Extract<DocBlock, { kind: "endpoint" }>): string {
  const out = [`#### \`${b.method} ${b.path}\``, "", b.summary];
  if (b.params?.length) {
    out.push("", "| Parameter | Type | Required | Description |", "| --- | --- | --- | --- |");
    for (const p of b.params) {
      out.push(`| \`${p.name}\` | ${p.type} | ${p.required ? "yes" : "no"} | ${p.desc} |`);
    }
  }
  if (b.request) out.push("", "Request:", "", "```json", b.request, "```");
  if (b.response) out.push("", "Response:", "", "```json", b.response, "```");
  return out.join("\n");
}

function blockMarkdown(b: DocBlock): string {
  switch (b.kind) {
    case "prose":
      return b.text;
    case "code":
      return [b.label ? `${b.label}:` : null, "", "```" + b.lang, b.code, "```"]
        .filter((l) => l !== null)
        .join("\n");
    case "note":
      return `> **${b.tone === "warn" ? "Important" : "Note"}:** ${b.text}`;
    case "table":
      return [
        `| ${b.headers.join(" | ")} |`,
        `| ${b.headers.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n");
    case "endpoint":
      return endpointMarkdown(b);
  }
}

export function docsToMarkdown(): string {
  const out = [
    "# Post Train API & MCP reference",
    "",
    `REST API base: ${API_BASE}`,
    `MCP server: ${MCP_URL}`,
    "",
    "Included with every paid Post Train plan.",
  ];
  for (const group of DOCS) {
    out.push("", `## ${group.title}`);
    for (const section of group.sections) {
      out.push("", `### ${section.title}`, "");
      out.push(section.blocks.map(blockMarkdown).join("\n\n"));
    }
  }
  return out.join("\n") + "\n";
}
