// RFC 9728 protected-resource metadata — how an MCP client discovers which
// authorization server guards /api/mcp. Must stay unauthenticated: this is the
// document a client fetches *because* it got a 401.
import { ALL_SCOPES, issuerUrl, mcpResourceUri } from "@/lib/mcp-oauth";

function metadata(origin: string) {
  return Response.json(
    {
      resource: mcpResourceUri(origin),
      authorization_servers: [issuerUrl(origin)],
      scopes_supported: ALL_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/docs/api`,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}

export async function GET(req: Request) {
  return metadata(new URL(req.url).origin);
}
