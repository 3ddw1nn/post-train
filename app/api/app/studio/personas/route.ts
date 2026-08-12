import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { listPersonas, VOICES } from "@/lib/replicate-avatar";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ data: await listPersonas(), voices: VOICES });
  } catch (e) {
    return jsonError(e);
  }
}
