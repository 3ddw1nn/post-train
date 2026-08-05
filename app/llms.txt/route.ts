// llms.txt — the emerging convention for pointing AI crawlers and agents at
// clean Markdown instead of leaving them to scrape rendered pages.
import { API_BASE, MCP_URL } from "@/lib/docs/api-reference";

const SITE = "https://posttrain.app";

export async function GET() {
  const body = `# Post Train

> Social cross-posting and scheduling: write once, publish everywhere, on a
> schedule or through queue slots. Supports X/Twitter, Instagram, TikTok,
> YouTube, LinkedIn, Facebook, Threads, Bluesky, Pinterest, Mastodon, and Tumblr.

Post Train is programmable. Agents can drive it two ways:

- REST API v1 — ${API_BASE} — Bearer API key
- MCP server — ${MCP_URL} — OAuth 2.1, or the same API key

Both are included with every paid plan.

## Docs

- [API & MCP reference](${SITE}/docs/api.md): every endpoint, every MCP tool, auth, scopes, rate limits
- [API reference (HTML)](${SITE}/docs/api)

## MCP

The MCP server is streamable-HTTP and exposes 11 tools mirroring the REST API.
Add ${MCP_URL} as a custom connector in Claude, or:

    claude mcp add --transport http posttrain ${MCP_URL}

Scopes: \`read\` (6 read-only tools) and \`publish\` (5 mutating tools).
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
