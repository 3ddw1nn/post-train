import { getMediaRedirectUrl } from "@/lib/media";

// Serves stored media bytes (stands in for the public CDN host).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = await getMediaRedirectUrl(id);
  if (!found) return new Response("Not found", { status: 404 });
  return Response.redirect(found.url, 302);
}
