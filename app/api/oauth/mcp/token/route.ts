// Token endpoint: authorization_code and refresh_token grants.
//
// Both paths redeem the presented credential atomically (Convex consumeGrant
// patches inside the read transaction), so replaying a code — the classic
// interception attack PKCE exists to blunt — fails on the second use even if
// two requests race.
import {
  clientSecretValid,
  consumeGrant,
  findClient,
  issueRefreshToken,
  mintAccessToken,
  oauthError,
  verifyPkce,
} from "@/lib/mcp-oauth";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Expected an application/x-www-form-urlencoded body.");
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.length ? v : null;
  };

  const grantType = field("grant_type");
  const clientId = field("client_id");
  if (!clientId) return oauthError("invalid_client", "client_id is required.");

  const client = await findClient(clientId);
  if (!client) return oauthError("invalid_client", "Unknown client.", 401);
  if (!clientSecretValid(client, field("client_secret"))) {
    return oauthError("invalid_client", "Client authentication failed.", 401);
  }

  if (grantType === "authorization_code") {
    const code = field("code");
    const verifier = field("code_verifier");
    const redirectUri = field("redirect_uri");
    if (!code) return oauthError("invalid_request", "code is required.");
    if (!verifier) return oauthError("invalid_request", "code_verifier is required (PKCE).");

    const grant = await consumeGrant(code);
    if (!grant || grant.kind !== "code") {
      return oauthError("invalid_grant", "The authorization code is invalid, expired, or already used.");
    }
    // A code issued to one client must not be redeemable by another.
    if (grant.client_id !== clientId) return oauthError("invalid_grant", "This code was issued to a different client.");
    if (redirectUri && grant.redirect_uri !== redirectUri) {
      return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
    }
    if (!grant.code_challenge || !verifyPkce(verifier, grant.code_challenge)) {
      return oauthError("invalid_grant", "PKCE verification failed.");
    }

    const { token, expiresIn } = mintAccessToken({
      sub: grant.user_id,
      ws: grant.workspace_id,
      cid: grant.client_id,
      scope: grant.scope,
      aud: grant.resource,
    });
    const refresh = await issueRefreshToken({
      clientId: grant.client_id,
      userId: grant.user_id,
      workspaceId: grant.workspace_id,
      scope: grant.scope,
      resource: grant.resource,
    });
    return Response.json(
      {
        access_token: token,
        token_type: "Bearer",
        expires_in: expiresIn,
        refresh_token: refresh,
        scope: grant.scope,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (grantType === "refresh_token") {
    const presented = field("refresh_token");
    if (!presented) return oauthError("invalid_request", "refresh_token is required.");

    // Rotation: the presented refresh token is consumed and a fresh one issued,
    // so a stolen token stops working as soon as the real client refreshes.
    const grant = await consumeGrant(presented);
    if (!grant || grant.kind !== "refresh") {
      return oauthError("invalid_grant", "The refresh token is invalid, expired, or revoked.");
    }
    if (grant.client_id !== clientId) {
      return oauthError("invalid_grant", "This refresh token was issued to a different client.");
    }

    // A refresh may narrow scope but never widen it beyond the original grant.
    const requested = field("scope");
    const granted = grant.scope.split(/\s+/).filter(Boolean);
    const scope = requested
      ? requested.split(/\s+/).filter((s) => granted.includes(s)).join(" ") || grant.scope
      : grant.scope;

    const { token, expiresIn } = mintAccessToken({
      sub: grant.user_id,
      ws: grant.workspace_id,
      cid: grant.client_id,
      scope,
      aud: grant.resource,
    });
    const rotated = await issueRefreshToken({
      clientId: grant.client_id,
      userId: grant.user_id,
      workspaceId: grant.workspace_id,
      scope,
      resource: grant.resource,
    });
    return Response.json(
      { access_token: token, token_type: "Bearer", expires_in: expiresIn, refresh_token: rotated, scope },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return oauthError("unsupported_grant_type", "Supported grant types: authorization_code, refresh_token.");
}
