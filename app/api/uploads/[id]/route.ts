import { completeUpload, readMediaFile, storeUpload } from "@/lib/media";

// Signed PUT target from create-upload-url (stands in for a storage bucket's
// signed URL — no session required, the signature is the credential).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sig = new URL(req.url).searchParams.get("sig") ?? "";
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    const row = await storeUpload(id, sig, buf);
    return Response.json({ ok: true, media_id: row.id });
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "Upload failed." } },
      { status: 400 }
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sig = new URL(req.url).searchParams.get("sig") ?? "";
  try {
    const row = await completeUpload(id, sig);
    return Response.json({ ok: true, media_id: row.id });
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "Upload completion failed." } },
      { status: 400 }
    );
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sig = new URL(req.url).searchParams.get("sig") ?? "";
  const { sign } = await import("@/lib/auth");
  if (sign(`read:${id}`) !== sig) return new Response("Not found", { status: 404 });
  const found = await readMediaFile(id);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.row.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${found.row.name.replace(/"/g, "")}"`,
    },
  });
}
