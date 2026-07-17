import { getDb, now, MEDIA_DIR } from "./db";
import { sign } from "./auth";
import { randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

export type MediaRow = {
  id: string;
  workspace_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  kind: "image" | "video" | "pdf";
  duration_s: number | null;
  width: number | null;
  height: number | null;
  upload_status: "pending" | "uploaded" | "failed";
  created_at: string;
};

export const MAX_MEDIA_BYTES = 250 * 1024 * 1024; // bulk video cap, used as global cap

export function kindFromMime(mime: string): MediaRow["kind"] {
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return "image";
}

export function createUploadUrl(
  workspaceId: string,
  opts: { mime_type: string; size_bytes: number; name: string },
  origin: string
): { media_id: string; upload_url: string } {
  if (opts.size_bytes > MAX_MEDIA_BYTES) {
    throw new Error("File exceeds the 250MB limit.");
  }
  const id = `mid_${randomBytes(12).toString("hex")}`;
  getDb()
    .prepare(
      `INSERT INTO media (id, workspace_id, name, mime_type, size_bytes, kind, upload_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(id, workspaceId, opts.name, opts.mime_type, opts.size_bytes, kindFromMime(opts.mime_type), now());
  return { media_id: id, upload_url: `${origin}/api/uploads/${id}?sig=${sign(`upload:${id}`)}` };
}

export function storeUpload(mediaId: string, sig: string, body: Buffer): MediaRow {
  if (sign(`upload:${mediaId}`) !== sig) throw new Error("Invalid upload signature.");
  const db = getDb();
  const row = db.prepare("SELECT * FROM media WHERE id = ?").get(mediaId) as MediaRow | undefined;
  if (!row) throw new Error("Unknown media id.");
  if (body.byteLength > MAX_MEDIA_BYTES) throw new Error("File exceeds the 250MB limit.");
  writeFileSync(path.join(MEDIA_DIR, mediaId), body);
  db.prepare("UPDATE media SET upload_status = 'uploaded', size_bytes = ? WHERE id = ?").run(
    body.byteLength,
    mediaId
  );
  return db.prepare("SELECT * FROM media WHERE id = ?").get(mediaId) as MediaRow;
}

export function readMediaFile(mediaId: string): { row: MediaRow; bytes: Buffer } | null {
  const row = getDb().prepare("SELECT * FROM media WHERE id = ?").get(mediaId) as
    | MediaRow
    | undefined;
  if (!row) return null;
  const file = path.join(MEDIA_DIR, mediaId);
  if (!existsSync(file)) return null;
  return { row, bytes: readFileSync(file) };
}

export function deleteMedia(workspaceId: string, mediaId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM media WHERE id = ? AND workspace_id = ?")
    .get(mediaId, workspaceId);
  if (!row) return false;
  db.prepare("DELETE FROM post_media WHERE media_id = ?").run(mediaId);
  db.prepare("DELETE FROM media WHERE id = ?").run(mediaId);
  const file = path.join(MEDIA_DIR, mediaId);
  if (existsSync(file)) unlinkSync(file);
  return true;
}

export function listMedia(workspaceId: string, limit = 50, offset = 0): { data: MediaRow[]; count: number } {
  const db = getDb();
  const data = db
    .prepare(
      "SELECT * FROM media WHERE workspace_id = ? AND upload_status = 'uploaded' ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(workspaceId, limit, offset) as MediaRow[];
  const count = (
    db
      .prepare("SELECT COUNT(*) c FROM media WHERE workspace_id = ? AND upload_status = 'uploaded'")
      .get(workspaceId) as { c: number }
  ).c;
  return { data, count };
}

/** Server-side download for `media_urls` (MCP/agent parity). */
export async function importFromUrl(workspaceId: string, url: string): Promise<MediaRow> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);
  const mime = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_MEDIA_BYTES) throw new Error("Downloaded file exceeds the 250MB limit.");
  const name = new URL(url).pathname.split("/").pop() || "download";
  const id = `mid_${randomBytes(12).toString("hex")}`;
  writeFileSync(path.join(MEDIA_DIR, id), buf);
  getDb()
    .prepare(
      `INSERT INTO media (id, workspace_id, name, mime_type, size_bytes, kind, upload_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'uploaded', ?)`
    )
    .run(id, workspaceId, name, mime, buf.byteLength, kindFromMime(mime), now());
  return getDb().prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow;
}

export const mediaFileUrl = (id: string) => `/api/media-file/${id}`;
