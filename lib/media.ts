import {
  convexMutation,
  convexQuery,
  ensureMediaDir,
  MEDIA_DIR,
} from "./db";
import { sign } from "./auth";
import { randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { api } from "@/convex/_generated/api";
import {
  createR2DownloadUrl,
  createR2UploadUrl,
  deleteR2Object,
  fetchR2,
  mediaObjectKey,
  r2Enabled,
} from "./r2";

export type MediaRow = {
  id: string;
  workspace_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  kind: "image" | "video" | "pdf" | "audio";
  duration_s: number | null;
  width: number | null;
  height: number | null;
  upload_status: "pending" | "uploaded" | "failed";
  created_at: string;
  thumbnail_media_id?: string | null;
  studio_template?: string | null;
  studio_batch_id?: string | null;
  studio_finished_at?: string | null;
  studio_campaign_name?: string | null;
  studio_platform_ids?: string[];
  studio_platform_id?: string | null;
  studio_aspect_ratio?: string | null;
  /** JSON-encoded Record<platformId, caption> — parse before use. */
  studio_platform_captions?: string | null;
  studio_caption_brief?: string | null;
  studio_caption_length?: string | null;
};
export type UploadTarget = {
  media_id: string;
  upload_url: string;
  complete_url: string;
  storage: "r2" | "local";
};

export const MAX_MEDIA_BYTES = 250 * 1024 * 1024; // bulk video cap, used as global cap

export function kindFromMime(mime: string): MediaRow["kind"] {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "image";
}

export async function createUploadUrl(
  workspaceId: string,
  opts: { mime_type: string; size_bytes: number; name: string },
  origin: string
): Promise<UploadTarget> {
  if (opts.size_bytes > MAX_MEDIA_BYTES) {
    throw new Error("File exceeds the 250MB limit.");
  }
  const id = `mid_${randomBytes(12).toString("hex")}`;
  await convexMutation(api.media.createMedia, {
    id,
    workspace_id: workspaceId,
    name: opts.name,
    mime_type: opts.mime_type,
    size_bytes: opts.size_bytes,
    kind: kindFromMime(opts.mime_type),
    upload_status: "pending",
  });
  const complete_url = `${origin}/api/uploads/${id}?sig=${sign(`complete:${id}`)}`;
  return {
    media_id: id,
    upload_url: `${origin}/api/uploads/${id}?sig=${sign(`upload:${id}`)}`,
    complete_url,
    storage: r2Enabled() ? "r2" : "local",
  };
}

export async function storeUpload(mediaId: string, sig: string, body: Buffer): Promise<MediaRow> {
  if (sign(`upload:${mediaId}`) !== sig) throw new Error("Invalid upload signature.");
  const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
  if (!row) throw new Error("Unknown media id.");
  if (body.byteLength > MAX_MEDIA_BYTES) throw new Error("File exceeds the 250MB limit.");
  if (r2Enabled()) {
    const uploadUrl = await createR2UploadUrl({
      key: mediaObjectKey(row.workspace_id, mediaId),
      contentType: row.mime_type,
      contentLength: body.byteLength,
    });
    const put = await fetchR2(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": row.mime_type },
      body: new Uint8Array(body),
    }).catch((e) => {
      throw new Error(e instanceof Error ? `We couldn't save this file: ${e.message}` : "We couldn't save this file. Please try again.");
    });
    if (!put.ok) {
      const detail = (await put.text().catch(() => "")).slice(0, 300);
      console.error("[media] object upload failed", { status: put.status, detail });
      throw new Error("We couldn't save this file. Please try again.");
    }
  } else {
    ensureMediaDir();
    writeFileSync(path.join(MEDIA_DIR, mediaId), body);
  }
  return await convexMutation<MediaRow>(api.media.markUploaded, {
    id: mediaId,
    size_bytes: body.byteLength,
  });
}

export async function completeUpload(mediaId: string, sig: string): Promise<MediaRow> {
  if (sign(`complete:${mediaId}`) !== sig) throw new Error("Invalid upload signature.");
  const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
  if (!row) throw new Error("Unknown media id.");
  if (row.upload_status !== "uploaded") {
    throw new Error("This upload is still processing. Please try again in a moment.");
  }
  return row;
}

export async function getMediaRedirectUrl(mediaId: string): Promise<{ row: MediaRow; url: string } | null> {
  const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
  if (!row) return null;
  if (r2Enabled()) {
    return { row, url: await createR2DownloadUrl(mediaObjectKey(row.workspace_id, mediaId)) };
  }
  return { row, url: `/api/uploads/${mediaId}?sig=${sign(`read:${mediaId}`)}` };
}

export async function readMediaFile(mediaId: string): Promise<{ row: MediaRow; bytes: Buffer } | null> {
  const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
  if (!row) return null;
  const file = path.join(MEDIA_DIR, mediaId);
  if (!existsSync(file)) return null;
  return { row, bytes: readFileSync(file) };
}

/** Media bytes regardless of storage backend (R2 or local disk) — for publish adapters. */
export async function readMediaBytes(mediaId: string): Promise<{ row: MediaRow; bytes: Buffer } | null> {
  const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
  if (!row) return null;
  if (r2Enabled()) {
    const url = await createR2DownloadUrl(mediaObjectKey(row.workspace_id, mediaId));
    const res = await fetchR2(url);
    if (!res.ok) return null;
    return { row, bytes: Buffer.from(await res.arrayBuffer()) };
  }
  const file = path.join(MEDIA_DIR, mediaId);
  if (!existsSync(file)) return null;
  return { row, bytes: readFileSync(file) };
}

export async function deleteMedia(workspaceId: string, mediaId: string): Promise<boolean> {
  if (r2Enabled()) {
    await deleteR2Object(mediaObjectKey(workspaceId, mediaId)).catch((error) => {
      console.warn("[media] failed to delete R2 object", error);
    });
  }
  const ok = await convexMutation<boolean>(api.media.deleteMedia, {
    workspace_id: workspaceId,
    id: mediaId,
  });
  if (!ok) return false;
  const file = path.join(MEDIA_DIR, mediaId);
  if (existsSync(file)) unlinkSync(file);
  return true;
}

/** Attaches (or clears, with `null`) a cover image to a video — set from the Thumbnail Maker tool. */
export async function setMediaThumbnail(workspaceId: string, mediaId: string, thumbnailMediaId: string | null): Promise<MediaRow | null> {
  return await convexMutation<MediaRow | null>(api.media.setThumbnail, {
    workspace_id: workspaceId,
    id: mediaId,
    thumbnail_media_id: thumbnailMediaId,
  });
}

/** A Content Studio "Finish" step — marks one or more outputs as Library items. Returns the shared batch id. */
export async function markMediaFinished(
  workspaceId: string,
  mediaIds: string[],
  template: string,
  metadata: {
    campaignName?: string;
    platformIds?: string[];
    platformCaptions?: Record<string, string>;
    captionBrief?: string;
    captionLength?: "short" | "medium" | "long";
    outputs?: { mediaId: string; platformId: string; aspectRatio: string }[];
  } = {},
): Promise<string> {
  const batchId = `batch_${randomBytes(8).toString("hex")}`;
  const captions = metadata.platformCaptions ?? {};
  await convexMutation(api.media.markFinished, {
    workspace_id: workspaceId,
    ids: mediaIds,
    template,
    batch_id: batchId,
    campaign_name: metadata.campaignName?.trim() || null,
    platform_ids: metadata.platformIds ?? [],
    platform_captions: Object.keys(captions).length > 0 ? JSON.stringify(captions) : null,
    caption_brief: metadata.captionBrief?.trim() || null,
    caption_length: metadata.captionLength ?? null,
    output_metadata: metadata.outputs?.map((output) => ({ media_id: output.mediaId, platform_id: output.platformId, aspect_ratio: output.aspectRatio })) ?? [],
  });
  return batchId;
}

/** "Remove from Library" — clears the Finish marker only; the media itself is untouched. */
export async function clearMediaFinished(workspaceId: string, mediaId: string): Promise<boolean> {
  return await convexMutation<boolean>(api.media.clearFinished, { workspace_id: workspaceId, id: mediaId });
}

export async function listFinishedMedia(workspaceId: string, template: string): Promise<MediaRow[]> {
  return await convexQuery<MediaRow[]>(api.media.listFinishedForWorkspace, { workspace_id: workspaceId, template });
}

// Templates whose Finish step produces a video (Slideshow and Thumbnail
// Maker finish as images, so they're deliberately excluded).
const VIDEO_STUDIO_TEMPLATES = ["grid-2x2", "fade-in", "ai-ugc"];

/** Every finished Content Studio video, across every video template — the
 *  pool a "Library" button offers wherever a studio picks a video clip to
 *  reuse as source footage (never raw uploads or in-progress drafts). */
export async function listFinishedStudioVideos(workspaceId: string): Promise<MediaRow[]> {
  const lists = await Promise.all(VIDEO_STUDIO_TEMPLATES.map((template) => listFinishedMedia(workspaceId, template)));
  return lists.flat().sort((a, b) => (b.studio_finished_at ?? "").localeCompare(a.studio_finished_at ?? ""));
}

export async function listMedia(workspaceId: string, limit = 50, offset = 0): Promise<{ data: MediaRow[]; count: number }> {
  return await convexQuery<{ data: MediaRow[]; count: number }>(api.media.listForWorkspace, {
    workspace_id: workspaceId,
    limit,
    offset,
  });
}

/** Server-side download for `media_urls` (MCP/agent parity). */
export async function importFromUrl(workspaceId: string, url: string): Promise<MediaRow> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);
  const mime = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  const name = new URL(url).pathname.split("/").pop() || "download";
  return await saveBufferAsMedia(workspaceId, buf, name, mime);
}

/** Ingest a locally produced file (e.g. a Content Studio render) into the media library. */
export async function importFromFile(workspaceId: string, filePath: string, name: string, mime: string): Promise<MediaRow> {
  return await saveBufferAsMedia(workspaceId, readFileSync(filePath), name, mime);
}

export async function saveBufferAsMedia(workspaceId: string, buf: Buffer, name: string, mime: string): Promise<MediaRow> {
  if (buf.byteLength > MAX_MEDIA_BYTES) throw new Error("File exceeds the 250MB limit.");
  const id = `mid_${randomBytes(12).toString("hex")}`;
  if (r2Enabled()) {
    await convexMutation(api.media.createMedia, {
      id,
      workspace_id: workspaceId,
      name,
      mime_type: mime,
      size_bytes: buf.byteLength,
      kind: kindFromMime(mime),
      upload_status: "pending",
    });
    const uploadUrl = await createR2UploadUrl({
      key: mediaObjectKey(workspaceId, id),
      contentType: mime,
      contentLength: buf.byteLength,
    });
    const put = await fetchR2(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: new Uint8Array(buf),
    }).catch((e) => {
      throw new Error(e instanceof Error ? `Could not upload the rendered file: ${e.message}` : "Could not upload the rendered file.");
    });
    if (!put.ok) throw new Error(`Could not upload imported media (${put.status})`);
    return await convexMutation<MediaRow>(api.media.markUploaded, {
      id,
      size_bytes: buf.byteLength,
    });
  }
  ensureMediaDir();
  writeFileSync(path.join(MEDIA_DIR, id), buf);
  return await convexMutation<MediaRow>(api.media.createMedia, {
    id,
    workspace_id: workspaceId,
    name,
    mime_type: mime,
    size_bytes: buf.byteLength,
    kind: kindFromMime(mime),
    upload_status: "uploaded",
  });
}

export const mediaFileUrl = (id: string) => `/api/media-file/${id}`;
