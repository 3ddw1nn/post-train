// Dashboard-side revocation for the Connected Apps panel. Scoped to the
// signed-in user's own grants — client_id alone never identifies whose access
// is being revoked, so the user id comes from the session, never the body.
import { requireUser } from "@/lib/auth";
import { revokeClientForUser } from "@/lib/mcp-oauth";

export async function DELETE(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const clientId = typeof body?.client_id === "string" ? body.client_id : "";
  if (!clientId) {
    return Response.json({ error: { message: "client_id is required." } }, { status: 400 });
  }
  const revoked = await revokeClientForUser(user.id, clientId);
  return Response.json({ ok: true, revoked });
}
