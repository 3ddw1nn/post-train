import { authenticateApiKey, jsonError } from "@/lib/api-auth";
import { accountsForWorkspace } from "@/lib/accounts";

export async function GET(req: Request) {
  try {
    const ctx = await authenticateApiKey(req);
    const data = (await accountsForWorkspace(ctx.workspace.id)).map((a) => ({
      id: a.id,
      platform: a.platform,
      username: a.username,
    }));
    return Response.json({ data, count: data.length });
  } catch (e) {
    return jsonError(e);
  }
}
