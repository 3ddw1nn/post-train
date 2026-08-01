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
  headR2Object,
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
  studio_draft_id?: string | null;
  studio_finished_at?: string | null;
  studio_campaign_name?: string | null;
  studio_platform_ids?: string[];
  studio_platform_id?: string | null;
  studio_aspect_ratio?: string | null;
  /** JSON-encoded Record<platformId, caption> — parse before use. */
  studio_platform_captions?: string | null;
  studio_caption_brief?: string | null;
  studio_caption_length?: string | null;
  /** Derived for the Library: source uploads plus every output in one project. */
  project_size_bytes?: number;
};
export type UploadTarget = {
  media_id: string;
  upload_url: string;
  complete_url: string;
  storage: "r2" | "local";
};

export const MAX_MEDIA_BYTES = 250 * 1024 * 1024; // bulk video cap, used as global cap
/** Every workspace has the same storage allowance, independent of plan or role. */
export const WORKSPACE_STORAGE_BYTES = 1024 * 1024 * 1024;

export type WorkspaceStorageStatus = {
  usedBytes: number;
  limitBytes: number;
  fileCount: number;
  autoCleanup: boolean;
  isFull: boolean;
};

export class StorageLimitError extends Error {
  readonly code = "STORAGE_LIMIT_REACHED";

  constructor() {
    super("Storage is full. Delete files from your Library or turn on automatic cleanup.");
    this.name = "StorageLimitError";
  }
}

function normalizeStorageError(error: unknown): never {
  if (error instanceof StorageLimitError) throw error;
  if (error instanceof Error && error.message.includes("STORAGE_LIMIT_REACHED")) {
    throw new StorageLimitError();
  }
  throw error;
}

export async function getWorkspaceStorageStatus(workspaceId: string): Promise<WorkspaceStorageStatus> {
  const [usage, workspace] = await Promise.all([
    convexQuery<{ bytes: number; count: number; truncated: boolean }>(api.media.storageUsage, { workspace_id: workspaceId }),
    convexQuery<{ owner_id: string; auto_cleanup_storage?: number } | null>(api.workspaces.getById, { id: workspaceId }),
  ]);
  const limitBytes = WORKSPACE_STORAGE_BYTES;
  const usedBytes = usage.truncated ? Math.max(usage.bytes, limitBytes) : usage.bytes;
  return {
    usedBytes,
    limitBytes,
    fileCount: usage.count,
    autoCleanup: (workspace?.auto_cleanup_storage ?? 1) === 1,
    isFull: usedBytes >= limitBytes,
  };
}

async function removeStoredMedia(workspaceId: string, mediaId: string): Promise<number | null> {
  const row = await convexMutation<{ id: string; kind: string; name: string; size_bytes: number } | null>(
    api.media.removeForStorageCleanup,
    { workspace_id: workspaceId, id: mediaId },
  );
  if (!row) return null;
  if (r2Enabled()) {
    await deleteR2Object(mediaObjectKey(workspaceId, row.id, row.kind, path.extname(row.name).toLowerCase())).catch((error) => {
      console.warn("[media] failed to delete storage-cleanup R2 object", error);
    });
  }
  const file = path.join(MEDIA_DIR, mediaId);
  if (existsSync(file)) unlinkSync(file);
  return Math.max(0, row.size_bytes);
}

/** Permanently removes media when it is not used by a post, draft, source, or thumbnail. */
export async function deleteMediaForStorageCleanup(workspaceId: string, mediaId: string): Promise<boolean> {
  return (await removeStoredMedia(workspaceId, mediaId)) !== null;
}

async function ensureWorkspaceStorageCapacity(workspaceId: string, incomingBytes: number) {
  let status = await getWorkspaceStorageStatus(workspaceId);
  if (status.usedBytes + incomingBytes <= status.limitBytes) return;
  if (!status.autoCleanup) throw new StorageLimitError();

  const candidates = await convexQuery<MediaRow[]>(api.media.oldestForStorageCleanup, {
    workspace_id: workspaceId,
    limit: 500,
    stale_pending_before: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  let usedBytes = status.usedBytes;
  for (const candidate of candidates) {
    const freedBytes = await removeStoredMedia(workspaceId, candidate.id);
    if (freedBytes !== null) usedBytes -= freedBytes;
    if (usedBytes + incomingBytes <= status.limitBytes) return;
  }

  status = await getWorkspaceStorageStatus(workspaceId);
  if (status.usedBytes + incomingBytes > status.limitBytes) throw new StorageLimitError();
}

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
  if (!Number.isFinite(opts.size_bytes) || opts.size_bytes < 0) {
    throw new Error("Enter a valid file size.");
  }
  if (opts.size_bytes > MAX_MEDIA_BYTES) {
    throw new Error("File exceeds the 250MB limit.");
  }
  await ensureWorkspaceStorageCapacity(workspaceId, opts.size_bytes);
  const id = `mid_${randomBytes(12).toString("hex")}`;
  try {
    await convexMutation(api.media.createMedia, {
      id,
      workspace_id: workspaceId,
      name: opts.name,
      mime_type: opts.mime_type,
      size_bytes: opts.size_bytes,
      kind: kindFromMime(opts.mime_type),
      upload_status: "pending",
    });
  } catch (error) {
    normalizeStorageError(error);
  }
  const complete_url = `${origin}/api/uploads/${id}?sig=${sign(`complete:${id}`)}`;
  const storage = r2Enabled() ? "r2" : "local";
  const upload_url = storage === "r2"
    ? await createR2UploadUrl({
        key: mediaObjectKey(
          workspaceId,
          id,
          kindFromMime(opts.mime_type),
          path.extname(opts.name).toLowerCase(),
        ),
        contentType: opts.mime_type,
        contentLength: opts.size_bytes,
      })
    : `${origin}/api/uploads/${id}?sig=${sign(`upload:${id}`)}`;
  return {
    media_id: id,
    upload_url,
    complete_url,
    storage,
  };
}

export async function storeUpload(mediaId: string, sig: string, body: Buffer): Promise<MediaRow> {
  if (sign(`upload:${mediaId}`) !== sig) throw new Error("Invalid upload signature.");
  const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
  if (!row) throw new Error("Unknown media id.");
  if (body.byteLength > MAX_MEDIA_BYTES) throw new Error("File exceeds the 250MB limit.");
  if (body.byteLength !== row.size_bytes) throw new Error("The uploaded file size doesn't match the reserved upload.");
  if (r2Enabled()) {
    const uploadUrl = await createR2UploadUrl({
      key: mediaObjectKey(row.workspace_id, mediaId, row.kind, path.extname(row.name).toLowerCase()),
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
  if (row.upload_status === "uploaded") return row;
  if (r2Enabled()) {
    const object = await headR2Object(
      mediaObjectKey(row.workspace_id, mediaId, row.kind, path.extname(row.name).toLowerCase())
    ).catch(() => null);
    if (!object) {
      throw new Error("The uploaded file was not found. Please try the upload again.");
    }
    if (object.size !== row.size_bytes) {
      throw new Error("The uploaded file size doesn't match the reserved upload.");
    }
    return await convexMutation<MediaRow>(api.media.markUploaded, {
      id: mediaId,
      size_bytes: object.size,
    });
  }
  throw new Error("This upload is still processing. Please try again in a moment.");
}

export async function getMediaRedirectUrl(mediaId: string): Promise<{ row: MediaRow; url: string } | null> {
  const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
  if (!row) return null;
  if (r2Enabled()) {
    return { row, url: await createR2DownloadUrl(mediaObjectKey(row.workspace_id, mediaId, row.kind, path.extname(row.name).toLowerCase())) };
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
    const url = await createR2DownloadUrl(mediaObjectKey(row.workspace_id, mediaId, row.kind, path.extname(row.name).toLowerCase()));
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
    const row = await convexQuery<MediaRow | null>(api.media.getById, { id: mediaId });
    if (row) {
      await deleteR2Object(mediaObjectKey(workspaceId, mediaId, row.kind, path.extname(row.name).toLowerCase())).catch((error) => {
        console.warn("[media] failed to delete R2 object", error);
      });
    }
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

/** Removes an R2 object only when its media row has become unreferenced. */
export async function deleteMediaIfUnreferenced(workspaceId: string, mediaId: string): Promise<boolean> {
  const row = await convexMutation<{ id: string; kind: string; name: string } | null>(api.media.removeIfUnreferenced, { workspace_id: workspaceId, id: mediaId });
  if (!row) return false;
  if (r2Enabled()) {
    await deleteR2Object(mediaObjectKey(workspaceId, row.id, row.kind, path.extname(row.name).toLowerCase())).catch((error) => {
      console.warn("[media] failed to delete orphaned R2 object", error);
    });
  }
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
    draftId?: string;
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
    draft_id: metadata.draftId ?? null,
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
  await ensureWorkspaceStorageCapacity(workspaceId, buf.byteLength);
  const id = `mid_${randomBytes(12).toString("hex")}`;
  if (r2Enabled()) {
    try {
      await convexMutation(api.media.createMedia, {
        id,
        workspace_id: workspaceId,
        name,
        mime_type: mime,
        size_bytes: buf.byteLength,
        kind: kindFromMime(mime),
        upload_status: "pending",
      });
    } catch (error) {
      normalizeStorageError(error);
    }
    const uploadUrl = await createR2UploadUrl({
      key: mediaObjectKey(workspaceId, id, kindFromMime(mime), path.extname(name).toLowerCase()),
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
  try {
    return await convexMutation<MediaRow>(api.media.createMedia, {
      id,
      workspace_id: workspaceId,
      name,
      mime_type: mime,
      size_bytes: buf.byteLength,
      kind: kindFromMime(mime),
      upload_status: "uploaded",
    });
  } catch (error) {
    if (existsSync(path.join(MEDIA_DIR, id))) unlinkSync(path.join(MEDIA_DIR, id));
    normalizeStorageError(error);
  }
}

export const mediaFileUrl = (id: string) => `/api/media-file/${id}`;
