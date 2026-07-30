import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { currentWorkspace } from "@/lib/workspaces";
import { DomainError } from "@/lib/posts";
import { buildThumbnailPrompt, thumbnailPreset, DEFAULT_PRESET_ID } from "@/lib/thumbnail-presets";
import { resolveWorkspaceKey } from "@/lib/image-gen-keys";
import { generateImage, MODEL_PROVIDER, REFERENCE_CAPABLE, type ImageGenModel, type ImageRef } from "@/lib/image-gen";

const MODELS: ImageGenModel[] = ["gpt-image-2", "nano-banana-2", "seedream-5"];
// Inline reference images ride in the JSON body as data URLs, so keep the
// total well under Gemini's 20MB inline-request cap.
const MAX_REF_BYTES = 6 * 1024 * 1024;

function decodeDataUrl(value: unknown): ImageRef | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_REF_BYTES) return null;
  return { bytes, mime: match[1] };
}

// Thumbnail Maker's "AI generate" background tab. Requires a workspace key
// (see lib/image-gen-keys.ts's resolveWorkspaceKey) — this bills the user's
// own key, not the operator's env var, so there's no shared quota to guard.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const subject = typeof body.subject === "string" ? body.subject : "";
    if (!subject.trim()) throw new DomainError(400, "Describe what the thumbnail should show first.");

    const model = MODELS.includes(body.model as ImageGenModel) ? (body.model as ImageGenModel) : "nano-banana-2";
    const preset = thumbnailPreset(typeof body.presetId === "string" ? body.presetId : DEFAULT_PRESET_ID);

    const refs: ImageRef[] = [];
    if (REFERENCE_CAPABLE[model] && Array.isArray(body.references)) {
      for (const entry of body.references.slice(0, 3)) {
        const ref = decodeDataUrl(entry);
        if (ref) refs.push(ref);
      }
    }

    const key = await resolveWorkspaceKey(ws.id, MODEL_PROVIDER[model]);
    if (!key) {
      throw new DomainError(403, "Add an API key for this provider on the AI image keys page first.", "no_key");
    }

    const prompt = buildThumbnailPrompt({
      subject,
      angle: typeof body.angle === "string" ? body.angle : undefined,
      style: typeof body.style === "string" ? body.style : undefined,
      presetId: preset.id,
      hasReference: refs.length > 0,
    });

    const image = await generateImage(model, prompt, key, refs, preset.aspect);
    return Response.json({
      image: `data:${image.mime};base64,${image.bytes.toString("base64")}`,
      prompt,
    });
  } catch (e) {
    if (e instanceof DomainError) return jsonError(e);
    console.error("[thumbnail] generation failed", e);
    return Response.json({ error: { message: "Couldn't reach the image provider right now." } }, { status: 502 });
  }
}
