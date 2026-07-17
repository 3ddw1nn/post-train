export const metadata = { title: "API Reference" };

function Endpoint({
  method,
  path,
  desc,
  body,
  response,
}: {
  method: string;
  path: string;
  desc: string;
  body?: string;
  response?: string;
}) {
  const tone =
    method === "GET"
      ? "bg-blue-50 text-blue-700"
      : method === "POST"
        ? "bg-primary-soft text-primary-deep"
        : method === "PATCH"
          ? "bg-amber-50 text-amber-700"
          : "bg-red-50 text-red-700";
  return (
    <div className="card p-5">
      <p className="flex flex-wrap items-center gap-2">
        <span className={`pill font-mono ${tone}`}>{method}</span>
        <code className="text-sm font-bold">{path}</code>
      </p>
      <p className="mt-1.5 text-sm text-muted">{desc}</p>
      {body && (
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-primary">
          {body}
        </pre>
      )}
      {response && (
        <pre className="mt-2 overflow-x-auto rounded-xl bg-page p-4 text-xs leading-relaxed text-ink/80">
          {response}
        </pre>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">API Reference (v1)</h1>
      <p className="mt-2 text-muted">
        Bearer-authenticated JSON API. Requires the API add-on on an active subscription.
      </p>

      <div className="card mt-6 p-5">
        <h2 className="font-bold">Authentication</h2>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-primary">
{`Authorization: Bearer pt_live_your_key_here
Base URL: {your-host}/api/v1`}
        </pre>
        <p className="mt-2 text-xs text-muted">
          401 = invalid key · 403 = add-on/subscription inactive · 400 = validation ·
          429 = rate limit (60 req/min). Lists paginate with <code>limit</code> (default
          50) + <code>offset</code> and return <code>count</code>.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Endpoint
          method="GET"
          path="/v1/social-accounts"
          desc="Connected accounts — ids are required for post creation."
          response={`{ "data": [ { "id": 1, "platform": "twitter", "username": "yourhandle" } ], "count": 1 }`}
        />
        <Endpoint
          method="POST"
          path="/v1/media/create-upload-url"
          desc="Two-step upload: request a signed URL, then PUT the raw bytes to it."
          body={`{ "mime_type": "video/mp4", "size_bytes": 1048576, "name": "video.mp4" }`}
          response={`201 → { "media_id": "mid_abc123", "upload_url": "https://…signed…" }
Then: PUT {upload_url}   (Content-Type: video/mp4, raw bytes)`}
        />
        <Endpoint
          method="GET"
          path="/v1/media?limit=50&offset=0"
          desc="List uploaded media."
        />
        <Endpoint method="DELETE" path="/v1/media/{media_id}" desc="Delete a media item." />
        <Endpoint
          method="POST"
          path="/v1/posts"
          desc="Create a post. use_queue and scheduled_at are mutually exclusive; omit both for an instant post. media_urls are downloaded server-side. Timezone priority: explicit > profile > UTC."
          body={`{
  "caption": "your caption here #hashtags",
  "media": ["mid_abc123"],
  "media_urls": ["https://public/file.mp4"],
  "social_accounts": [1, 2, 3],
  "scheduled_at": "2026-08-01T14:00:00Z",
  "is_draft": false,
  "use_queue": true,
  "platform_configurations": {
    "tiktok":    { "draft": true, "video_cover_timestamp_ms": 3000, "is_aigc": true },
    "instagram": { "is_trial_reel": true, "trial_graduation": "SS_PERFORMANCE" },
    "youtube":   { "title": "My Short Title" },
    "twitter":   { "caption": "platform-specific caption" },
    "pinterest": { "title": "Pin Title", "link": "https://…", "board_ids": ["b1"] }
  },
  "account_configurations": [ { "account_id": 1, "caption": "override" } ]
}`}
          response={`201 → { "id": "uuid", "status": "scheduled", … }`}
        />
        <Endpoint
          method="GET"
          path="/v1/posts?status=scheduled|published|failed|draft&platform=instagram"
          desc="List posts with filters."
        />
        <Endpoint method="GET" path="/v1/posts/{post_id}" desc="Full post details." />
        <Endpoint
          method="PATCH"
          path="/v1/posts/{post_id}"
          desc="Update caption, scheduled_at, social_accounts, media or configs — scheduled/draft posts only."
        />
        <Endpoint
          method="DELETE"
          path="/v1/posts/{post_id}"
          desc="Delete a scheduled/draft post. Published posts cannot be deleted."
        />
        <Endpoint
          method="GET"
          path="/v1/post-results?post_id={id}"
          desc="Per-platform publish outcomes with share URLs or error detail."
        />
        <Endpoint
          method="GET"
          path="/v1/analytics?platform=tiktok&timeframe=7d|30d|90d|all"
          desc="Analytics records (TikTok/YouTube/Instagram) with views, likes, comments, shares and match_confidence."
        />
        <Endpoint
          method="POST"
          path="/v1/analytics/sync?platform=tiktok"
          desc="Trigger a background metrics sync. Omit platform to sync all three."
          response={`202 → { "triggered": [ { "platform": "tiktok", "runId": "run_…" } ] }`}
        />
      </div>

      <div className="card mt-6 p-5">
        <h2 className="font-bold">Webhook</h2>
        <p className="mt-1 text-sm text-muted">
          Configure one URL per workspace (Dashboard → API Keys). On every post
          completion we POST the results, signed with your workspace secret.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-primary">
{`POST {your_url}
X-Signature: hex(hmac_sha256(secret, raw_body))

{ "event": "post.completed", "post_id": "uuid",
  "results": [ { "platform": "tiktok", "success": true, "share_url": "…" },
               { "platform": "youtube", "success": false, "error": "…" } ] }`}
        </pre>
      </div>

      <div className="card mt-6 p-5">
        <h2 className="font-bold">MCP server</h2>
        <p className="mt-1 text-sm text-muted">
          Streamable-HTTP MCP endpoint at <code>/api/mcp/mcp</code> exposing 11 tools that
          mirror this API — <code>create_post</code> accepts <code>media_urls</code> so
          agents skip the upload step. Authenticate with the same Bearer key.
        </p>
      </div>
    </section>
  );
}
