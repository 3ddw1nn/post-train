// RFC 7591 dynamic client registration. Claude calls this once, unauthenticated,
// the first time someone adds the connector — that's what lets a user paste a
// bare URL instead of provisioning credentials by hand.
//
// Open registration is what the spec expects of a public MCP server, and it
// grants nothing on its own: a registered client still can't touch any data
// until a signed-in user approves it on the consent screen. The blast radius of
// a junk registration is one unused row.
import { registerClient } from "@/lib/mcp-oauth";

const MAX_REDIRECT_URIS = 10;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    client_name?: unknown;
    redirect_uris?: unknown;
    token_endpoint_auth_method?: unknown;
  } | null;

  const redirectUris = Array.isArray(body?.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (!redirectUris.length) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "At least one redirect_uri is required." },
      { status: 400 }
    );
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: `At most ${MAX_REDIRECT_URIS} redirect URIs.` },
      { status: 400 }
    );
  }
  for (const uri of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return Response.json(
        { error: "invalid_redirect_uri", error_description: `Not a valid URL: ${uri}` },
        { status: 400 }
      );
    }
    // A redirect target is where an authorization code gets delivered, so it
    // has to be confidential in transit. Loopback stays allowed over http for
    // native/CLI clients, which is the one carve-out OAuth 2.1 keeps.
    const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
      return Response.json(
        { error: "invalid_redirect_uri", error_description: `Redirect URIs must use https (or http on loopback): ${uri}` },
        { status: 400 }
      );
    }
    if (parsed.hash) {
      return Response.json(
        { error: "invalid_redirect_uri", error_description: `Redirect URIs must not contain a fragment: ${uri}` },
        { status: 400 }
      );
    }
  }

  const isPublic = body?.token_endpoint_auth_method === "none";
  const { client, clientSecret } = await registerClient({
    clientName: typeof body?.client_name === "string" && body.client_name.trim() ? body.client_name : "MCP client",
    redirectUris,
    isPublic,
  });

  // client_secret is returned exactly once, like our API keys.
  return Response.json(
    {
      client_id: client.client_id,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: isPublic ? "none" : "client_secret_post",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 }
  );
}
