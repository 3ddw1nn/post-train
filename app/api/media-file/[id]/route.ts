import { readMediaFile } from "@/lib/media";

// Serves stored media bytes (stands in for the public CDN host).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = readMediaFile(id);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.row.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${found.row.name.replace(/"/g, "")}"`,
    },
  });
}
