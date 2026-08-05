// RFC 8414 authorization-server metadata. `issuer` must equal the origin the
// client used to build this URL, or a conforming client rejects the document.
import { ALL_SCOPES, issuerUrl } from "@/lib/mcp-oauth";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json(
    {
      issuer: issuerUrl(origin),
      // A page, not an API route — the browser lands here to sign in and consent.
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/mcp/token`,
      registration_endpoint: `${origin}/api/oauth/mcp/register`,
      revocation_endpoint: `${origin}/api/oauth/mcp/revoke`,
      scopes_supported: ALL_SCOPES,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // OAuth 2.1: PKCE is mandatory and `plain` is not allowed.
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      // RFC 8707 — we bind every token to a resource and validate it on use.
      authorization_response_iss_parameter_supported: true,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
