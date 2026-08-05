// MCP server (streamable-HTTP, JSON-RPC over POST) exposing the same 11 tools
// as the public API.
//
// Auth accepts either a workspace API key (pt_live_…) or an OAuth access token
// the user granted to an MCP client (pt_mcp_…). Unauthenticated requests get a
// 401 carrying a WWW-Authenticate challenge, which is how Claude discovers the
// authorization server and starts the connect flow — see lib/mcp-oauth.ts.
//
// ponytail: single request/response JSON-RPC only — no SSE streaming or session
// resumption; sufficient for tools/list + tools/call clients.
import { authenticateMcp, type ApiContext } from "@/lib/api-auth";
import { accountsForWorkspace } from "@/lib/accounts";
import {
  createPost,
  deletePost,
  findPost as findWorkspacePost,
  listPosts,
  serializePost,
  updatePost,
  DomainError,
} from "@/lib/posts";
import { listMedia, deleteMedia } from "@/lib/media";
import { listAnalytics, syncAnalytics } from "@/lib/analytics";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { listRecords } from "@/lib/db";
import { insufficientScope, mcpResourceUri, unauthorizedChallenge, type Scope } from "@/lib/mcp-oauth";

type Json = Record<string, unknown>;

/** Which consented scope each tool needs. Read-only tools stay usable on a read-only grant. */
const TOOL_SCOPES: Record<string, Scope> = {
  list_social_accounts: "read",
  list_posts: "read",
  get_post: "read",
  list_analytics: "read",
  list_post_results: "read",
  list_media: "read",
  create_post: "publish",
  update_post: "publish",
  delete_post: "publish",
  sync_analytics: "publish",
  delete_media: "publish",
};

const POST_FIELDS: Json = {
  caption: { type: "string" },
  social_accounts: { type: "array", items: { type: "number" }, description: "Social account ids from list_social_accounts." },
  media_urls: { type: "array", items: { type: "string" }, description: "Public URLs; downloaded server-side." },
  scheduled_at: { type: "string", description: "ISO 8601 datetime. Must be in the future." },
  use_queue: { type: "boolean" },
  is_draft: { type: "boolean" },
  platform_configurations: { type: "object", description: "Per-platform overrides keyed by platform id." },
};

const TOOLS: { name: string; description: string; inputSchema: Json }[] = [
  {
    name: "list_social_accounts",
    description: "List connected social accounts (their ids are used to create posts).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_post",
    description:
      "Create a post. Provide caption, social_accounts (ids), and optionally media_urls (public URLs downloaded server-side), scheduled_at (ISO), use_queue, is_draft, platform_configurations.",
    inputSchema: { type: "object", properties: POST_FIELDS, required: ["social_accounts"] },
  },
  {
    name: "list_posts",
    description: "List posts, filterable by status (scheduled|published|failed|draft) and platform.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        platform: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "get_post",
    description: "Get a post by id.",
    inputSchema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
  },
  {
    name: "update_post",
    description:
      "Update a scheduled or draft post. Only the fields you pass are changed; published posts cannot be updated.",
    inputSchema: {
      type: "object",
      properties: { post_id: { type: "string" }, ...POST_FIELDS },
      required: ["post_id"],
    },
  },
  {
    name: "delete_post",
    description: "Delete a scheduled or draft post (published posts cannot be deleted).",
    inputSchema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
  },
  {
    name: "list_analytics",
    description: "List analytics records (tiktok/youtube/instagram) with optional timeframe 7d|30d|90d|all.",
    inputSchema: {
      type: "object",
      properties: { platform: { type: "string" }, timeframe: { type: "string" } },
    },
  },
  {
    name: "sync_analytics",
    description: "Trigger an analytics sync for one platform or all.",
    inputSchema: { type: "object", properties: { platform: { type: "string" } } },
  },
  {
    name: "list_post_results",
    description: "Per-platform publish results for a post.",
    inputSchema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
  },
  {
    name: "list_media",
    description: "List uploaded media in the workspace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "delete_media",
    description: "Delete a media item by id.",
    inputSchema: { type: "object", properties: { media_id: { type: "string" } }, required: ["media_id"] },
  },
];

async function callTool(ctx: ApiContext, name: string, args: Json): Promise<unknown> {
  const findPost = (id: string) => findWorkspacePost(ctx.workspace.id, String(id));
  switch (name) {
    case "list_social_accounts":
      return (await accountsForWorkspace(ctx.workspace.id)).map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username,
      }));
    case "create_post":
      return await serializePost(
        await createPost(ctx.user, [ctx.workspace], args as never)
      );
    case "list_posts": {
      const { data, count } = await listPosts([ctx.workspace.id], {
        status: args.status as string | undefined,
        platform: args.platform as string | undefined,
        limit: (args.limit as number) ?? 50,
        offset: (args.offset as number) ?? 0,
      });
      return { data: await Promise.all(data.map(serializePost)), count };
    }
    case "get_post":
      return await serializePost(await findPost(args.post_id as string));
    case "update_post": {
      const { post_id, ...rest } = args;
      return await serializePost(await updatePost(await findPost(post_id as string), rest as never));
    }
    case "delete_post":
      await deletePost(await findPost(args.post_id as string));
      return { ok: true };
    case "list_analytics":
    case "sync_analytics": {
      if (!analyticsAccess(await getSubscription(ctx.user.id))) {
        throw new DomainError(403, "Analytics requires a Creator, Growth or Pro plan.");
      }
      if (name === "sync_analytics") {
        return { triggered: await syncAnalytics(ctx.workspace.id, args.platform as string | undefined) };
      }
      const { data, count } = await listAnalytics(ctx.workspace.id, {
        platform: args.platform as string | undefined,
        timeframe: args.timeframe as never,
      });
      return { data: data.map(({ workspace_id: _w, ...r }) => r), count };
    }
    case "list_post_results":
      return await listRecords("post_results", { post_id: (await findPost(args.post_id as string)).id });
    case "list_media":
      return await listMedia(ctx.workspace.id, 100, 0);
    case "delete_media":
      if (!(await deleteMedia(ctx.workspace.id, String(args.media_id)))) {
        throw new DomainError(404, "Media not found.");
      }
      return { ok: true };
    default:
      throw new DomainError(400, `Unknown tool: ${name}`);
  }
}

function rpcResult(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: unknown, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  let body: { id?: unknown; method?: string; params?: Json } | null = null;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const { id, method, params } = body ?? {};

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: (params?.protocolVersion as string) ?? "2025-06-18",
      serverInfo: { name: "post-train", version: "1.0.0" },
      capabilities: { tools: {} },
    });
  }
  if (method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  // Everything else needs credentials. A bare 401 would leave an MCP client
  // stuck; the WWW-Authenticate challenge is what points it at our OAuth
  // metadata so it can walk the user through connecting.
  let ctx: ApiContext;
  try {
    ctx = await authenticateMcp(req, mcpResourceUri(origin));
  } catch (e) {
    return unauthorizedChallenge(origin, e instanceof Error ? e.message : "Authorization required.");
  }

  try {
    switch (method) {
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        // Hide tools this grant can't call rather than advertising them and
        // failing at call time — a read-only client shouldn't see publish tools.
        return rpcResult(id, { tools: TOOLS.filter((t) => ctx.scopes.includes(TOOL_SCOPES[t.name])) });
      case "tools/call": {
        const name = String(params?.name ?? "");
        const needed = TOOL_SCOPES[name];
        if (!needed) return rpcError(id, -32602, `Unknown tool: ${name}`);
        if (!ctx.scopes.includes(needed)) return insufficientScope(origin, needed);
        const args = (params?.arguments as Json) ?? {};
        const result = await callTool(ctx, name, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    if (e instanceof DomainError) {
      return rpcResult(id, {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      });
    }
    console.error("[mcp] unexpected error", e);
    return rpcError(id, -32603, "Internal error");
  }
}

/** No SSE stream; the 401 still carries the challenge so discovery works from a GET. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!req.headers.get("authorization")) return unauthorizedChallenge(origin);
  return new Response("Post Train MCP server — send JSON-RPC via POST.", { status: 405 });
}
