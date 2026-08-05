// Receives the consent screen's decision and issues the authorization code.
// Every parameter is re-validated here rather than trusted from the form —
// the browser posting this is the same untrusted client that sent the user in.
import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { apiAccess } from "@/lib/entitlements";
import {
  findClient,
  issueAuthorizationCode,
  issuerUrl,
  parseScope,
  redirectUriRegistered,
} from "@/lib/mcp-oauth";

export async function POST(req: Request) {
  const user = await requireUser();
  const form = await req.formData();
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };

  const clientId = field("client_id");
  const redirectUri = field("redirect_uri");
  const state = field("state");
  const codeChallenge = field("code_challenge");
  const resource = field("resource");

  const client = await findClient(clientId);
  // Re-check the redirect against the registration: a forged POST could
  // otherwise name any callback and walk off with a valid code.
  if (!client || !redirectUriRegistered(client, redirectUri)) {
    return Response.json({ error: "invalid_client" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const back = new URL(redirectUri);
  if (state) back.searchParams.set("state", state);
  // RFC 9207 — lets the client detect a mix-up attack between authorization servers.
  back.searchParams.set("iss", issuerUrl(origin));

  if (field("decision") !== "approve") {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "The user declined the request.");
    return Response.redirect(back.toString(), 303);
  }

  if (!codeChallenge) {
    back.searchParams.set("error", "invalid_request");
    back.searchParams.set("error_description", "Missing PKCE code_challenge.");
    return Response.redirect(back.toString(), 303);
  }

  // Entitlement is checked again at approval time, not just on render — the
  // consent page could have been left open across a downgrade.
  if (!apiAccess(await getSubscription(user.id))) {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "This account's plan does not include API access.");
    return Response.redirect(back.toString(), 303);
  }

  const workspace = await currentWorkspace(user);
  const code = await issueAuthorizationCode({
    clientId,
    userId: user.id,
    workspaceId: workspace.id,
    scope: parseScope(field("scope")),
    resource: resource || `${origin}/api/mcp`,
    redirectUri,
    codeChallenge,
  });

  back.searchParams.set("code", code);
  return Response.redirect(back.toString(), 303);
}
