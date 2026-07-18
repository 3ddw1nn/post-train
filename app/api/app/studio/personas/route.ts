import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { listPersonas } from "@/lib/creatify";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ data: await listPersonas() });
  } catch (e) {
    return jsonError(e);
  }
}
