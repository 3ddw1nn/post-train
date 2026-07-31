import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { DomainError } from "@/lib/posts";
import { jsonError } from "@/lib/api-auth";
import { markMediaFinished, clearMediaFinished } from "@/lib/media";

const TEMPLATES = ["grid-2x2", "fade-in", "ai-ugc", "slideshow", "thumbnail"];

// The one endpoint every Content Studio template's "Finish" button calls —
// marks its output media as a Library item. Not gated on studioAccess like
// job creation is: by the time a user reaches Finish they've already
// rendered through a gated template, so this only ever touches media they
// already own.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mediaIds = Array.isArray(body.media_ids) ? [...new Set(body.media_ids.filter((id): id is string => typeof id === "string"))].slice(0, 12) : [];
    const template = typeof body.template === "string" ? body.template : "";
    const campaignName = typeof body.campaign_name === "string" ? body.campaign_name.trim().slice(0, 160) : "";
    const captionBrief = typeof body.caption_brief === "string" ? body.caption_brief.trim().slice(0, 2200) : "";
    const captionLength = body.caption_length === "short" || body.caption_length === "medium" || body.caption_length === "long"
      ? body.caption_length
      : undefined;
    const platformIds = Array.isArray(body.platform_ids)
      ? [...new Set(body.platform_ids.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 12)
      : [];
    const platformCaptions: Record<string, string> = {};
    if (body.platform_captions && typeof body.platform_captions === "object") {
      for (const [platformId, caption] of Object.entries(body.platform_captions as Record<string, unknown>)) {
        if (typeof caption === "string" && caption.trim()) platformCaptions[platformId] = caption.slice(0, 3000);
      }
    }
    const outputMetadata = Array.isArray(body.output_metadata)
      ? body.output_metadata.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const output = item as Record<string, unknown>;
          if (typeof output.media_id !== "string" || typeof output.platform_id !== "string" || typeof output.aspect_ratio !== "string") return [];
          if (!mediaIds.includes(output.media_id) || output.platform_id.length === 0 || output.aspect_ratio.length === 0) return [];
          return [{ mediaId: output.media_id, platformId: output.platform_id.slice(0, 64), aspectRatio: output.aspect_ratio.slice(0, 24) }];
        }).slice(0, 12)
      : [];
    if (mediaIds.length === 0) throw new DomainError(400, "Nothing to finish.");
    if (!TEMPLATES.includes(template)) throw new DomainError(400, "Unknown template.");

    const batchId = await markMediaFinished(ws.id, mediaIds, template, {
      campaignName,
      platformIds,
      platformCaptions,
      captionBrief,
      captionLength,
      outputs: outputMetadata,
    });
    return Response.json({ ok: true, batch_id: batchId });
  } catch (e) {
    return jsonError(e);
  }
}

// "Remove from Library" — clears the Finish marker only; never deletes media.
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    const id = new URL(req.url).searchParams.get("media_id");
    if (!id) throw new DomainError(400, "Missing media_id.");
    const ok = await clearMediaFinished(ws.id, id);
    if (!ok) throw new DomainError(404, "Not found.");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
