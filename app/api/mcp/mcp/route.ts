// Minimal MCP server (streamable-HTTP, JSON-RPC over POST) exposing the same
// 11 tools as the public API (spec 09 §MCP). Auth: Bearer API key.
// ponytail: single request/response JSON-RPC only — no SSE streaming or session
// resumption; sufficient for tools/list + tools/call clients.
import { authenticateApiKey, type ApiContext } from "@/lib/api-auth";
import { accountsForWorkspace } from "@/lib/accounts";
import {
  createPost,
  deletePost,
  getPostRow,
  listPosts,
  serializePost,
  updatePost,
  DomainError,
} from "@/lib/posts";
import { listMedia, deleteMedia } from "@/lib/media";
import { listAnalytics, syncAnalytics } from "@/lib/analytics";
import { getSubscription } from "@/lib/billing";
import { analyticsAccess } from "@/lib/entitlements";
import { getDb } from "@/lib/db";

type Json = Record<string, unknown>;

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
    inputSchema: {
      type: "object",
      properties: {
        caption: { type: "string" },
        social_accounts: { type: "array", items: { type: "number" } },
        media_urls: { type: "array", items: { type: "string" } },
        scheduled_at: { type: "string" },
        use_queue: { type: "boolean" },
        is_draft: { type: "boolean" },
        platform_configurations: { type: "object" },
      },
      required: ["social_accounts"],
    },
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
    description: "Update a scheduled/draft post (caption, scheduled_at, social_accounts, media, configs).",
    inputSchema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
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
  const findPost = (id: string) => {
    const post = getPostRow(String(id));
    if (!post || post.workspace_id !== ctx.workspace.id) {
      throw new DomainError(404, "Post not found.");
    }
    return post;
  };
  switch (name) {
    case "list_social_accounts":
      return accountsForWorkspace(ctx.workspace.id).map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username,
      }));
    case "create_post":
      return serializePost(
        await createPost(ctx.user, [ctx.workspace], args as never)
      );
    case "list_posts": {
      const { data, count } = listPosts([ctx.workspace.id], {
        status: args.status as string | undefined,
        platform: args.platform as string | undefined,
        limit: (args.limit as number) ?? 50,
        offset: (args.offset as number) ?? 0,
      });
      return { data: data.map(serializePost), count };
    }
    case "get_post":
      return serializePost(findPost(args.post_id as string));
    case "update_post": {
      const { post_id, ...rest } = args;
      return serializePost(updatePost(findPost(post_id as string), rest as never));
    }
    case "delete_post":
      deletePost(findPost(args.post_id as string));
      return { ok: true };
    case "list_analytics":
    case "sync_analytics": {
      if (!analyticsAccess(getSubscription(ctx.user.id))) {
        throw new DomainError(403, "Analytics requires a Creator, Growth or Pro plan.");
      }
      if (name === "sync_analytics") {
        return { triggered: syncAnalytics(ctx.workspace.id, args.platform as string | undefined) };
      }
      const { data, count } = listAnalytics(ctx.workspace.id, {
        platform: args.platform as string | undefined,
        timeframe: args.timeframe as never,
      });
      return { data: data.map(({ workspace_id: _w, ...r }) => r), count };
    }
    case "list_post_results": {
      const post = findPost(args.post_id as string);
      return getDb()
        .prepare("SELECT * FROM post_results WHERE post_id = ?")
        .all(post.id);
    }
    case "list_media":
      return listMedia(ctx.workspace.id, 100, 0);
    case "delete_media":
      if (!deleteMedia(ctx.workspace.id, String(args.media_id))) {
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
  let body: { id?: unknown; method?: string; params?: Json } | null = null;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const { id, method, params } = body ?? {};

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: (params?.protocolVersion as string) ?? "2025-03-26",
      serverInfo: { name: "post-train", version: "1.0.0" },
      capabilities: { tools: {} },
    });
  }
  if (method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  // Everything else requires a valid API key
  let ctx: ApiContext;
  try {
    ctx = authenticateApiKey(req);
  } catch (e) {
    return rpcError(id, -32001, e instanceof Error ? e.message : "Unauthorized");
  }

  try {
    switch (method) {
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call": {
        const name = String(params?.name ?? "");
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
    return rpcError(id, -32603, "Internal error");
  }
}

export async function GET() {
  return new Response(
    "Post Train MCP server — connect with a streamable-HTTP MCP client via POST, Authorization: Bearer pt_live_…",
    { status: 405 }
  );
}
