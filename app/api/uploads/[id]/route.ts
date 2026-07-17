import { storeUpload } from "@/lib/media";

// Signed PUT target from create-upload-url (stands in for a storage bucket's
// signed URL — no session required, the signature is the credential).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sig = new URL(req.url).searchParams.get("sig") ?? "";
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    const row = storeUpload(id, sig, buf);
    return Response.json({ ok: true, media_id: row.id });
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "Upload failed." } },
      { status: 400 }
    );
  }
}
