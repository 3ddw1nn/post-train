import { requireStaffUser } from "@/lib/auth";
import { createR2DownloadUrl } from "@/lib/r2";

export async function GET(req: Request) {
  await requireStaffUser();
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return Response.json({ error: { message: "Missing key." } }, { status: 400 });
  const url = await createR2DownloadUrl(key);
  return Response.json({ url });
}
