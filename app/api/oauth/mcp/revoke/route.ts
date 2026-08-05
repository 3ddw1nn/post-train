// RFC 7009 token revocation. Advertised in the AS metadata so a client can
// clean up after itself when a user removes the connector on its side.
import { clientSecretValid, consumeGrant, findClient } from "@/lib/mcp-oauth";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = form && typeof form.get("token") === "string" ? (form.get("token") as string) : null;
  const clientId = form && typeof form.get("client_id") === "string" ? (form.get("client_id") as string) : null;

  if (token && clientId) {
    const client = await findClient(clientId);
    const secret = typeof form!.get("client_secret") === "string" ? (form!.get("client_secret") as string) : null;
    if (client && clientSecretValid(client, secret)) {
      const grant = await consumeGrant(token);
      // Revoking another client's token is a no-op rather than an error — the
      // spec wants revocation to be idempotent and non-probing either way.
      void grant;
    }
  }

  // RFC 7009 §2.2: always 200, even for an unknown or already-dead token, so
  // this endpoint can't be used to test whether a token is valid.
  return new Response(null, { status: 200 });
}
