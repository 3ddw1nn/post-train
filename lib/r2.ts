import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_UPLOAD_TTL_SECONDS = 15 * 60;
const R2_DOWNLOAD_TTL_SECONDS = 60 * 60;

/** Presigned R2 requests occasionally fail at the network layer (DNS blip,
 *  connection reset) rather than with a real HTTP error — `fetch` surfaces
 *  that as a bare "fetch failed" with no status code to check. Every caller
 *  here is a plain idempotent GET/PUT against a presigned URL, so a couple
 *  of retries turns a transient hiccup into a non-event instead of losing
 *  an entire render (source download) or a finished one (output upload). */
export async function fetchR2(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastError = e;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("R2 request failed.");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export function r2Enabled() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

export function r2Bucket() {
  return required("R2_BUCKET");
}

export function r2PublicBaseUrl() {
  return process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") || null;
}

export function mediaObjectKey(workspaceId: string, mediaId: string, kind: string, ext: string) {
  return `workspaces/${workspaceId}/${kind}/${mediaId}${ext}`;
}

export function r2Client() {
  const accountId = required("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function createR2UploadUrl(opts: {
  key: string;
  contentType: string;
  contentLength: number;
}) {
  return await getSignedUrl(
    r2Client(),
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: opts.key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    }),
    { expiresIn: R2_UPLOAD_TTL_SECONDS }
  );
}

export async function createR2DownloadUrl(key: string) {
  // R2_PUBLIC_BASE_URL would be preferable (no per-request signing), but the
  // bucket's public dev URL currently fails the TLS handshake outright —
  // "Public Development URL" access looks disabled on the bucket. Presigned
  // GetObject requests go through R2's normal S3 API instead, which works
  // regardless of that setting. Re-enable the branch above once public
  // access is confirmed working.
  return await getSignedUrl(
    r2Client(),
    new GetObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
    }),
    { expiresIn: R2_DOWNLOAD_TTL_SECONDS }
  );
}

/** Confirms a browser upload reached R2 before its media row is made usable. */
export async function headR2Object(key: string) {
  const object = await r2Client().send(
    new HeadObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
    })
  );
  return {
    size: object.ContentLength ?? 0,
    contentType: object.ContentType ?? null,
  };
}

export type R2ObjectListing = {
  folders: string[];
  files: { key: string; size: number; lastModified: string | null }[];
  nextToken: string | null;
};

/** Drive-style directory listing: CommonPrefixes (delimited by "/") become
 *  folders, Contents become files directly under `prefix`. Staff storage
 *  browser only — one page (up to 1000 entries) per call. */
export async function listR2Objects(prefix: string, continuationToken?: string): Promise<R2ObjectListing> {
  const res = await r2Client().send(
    new ListObjectsV2Command({
      Bucket: r2Bucket(),
      Prefix: prefix,
      Delimiter: "/",
      ContinuationToken: continuationToken,
    })
  );
  return {
    folders: (res.CommonPrefixes ?? []).map((p) => p.Prefix!).filter(Boolean),
    files: (res.Contents ?? [])
      .filter((o) => o.Key && o.Key !== prefix)
      .map((o) => ({
        key: o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified ? o.LastModified.toISOString() : null,
      })),
    nextToken: res.IsTruncated ? res.NextContinuationToken ?? null : null,
  };
}

// Cloudflare R2's documented free-tier storage allowance.
export const R2_FREE_TIER_BYTES = 10 * 1024 ** 3;

/** Whole-bucket usage (all prefixes) — for the staff storage meter. Caps at
 *  50 pages (~50k objects) so a runaway bucket can't hang the page. */
export async function getR2BucketUsage(): Promise<{ bytes: number; objectCount: number }> {
  let bytes = 0;
  let objectCount = 0;
  let continuationToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await r2Client().send(
      new ListObjectsV2Command({ Bucket: r2Bucket(), ContinuationToken: continuationToken })
    );
    for (const o of res.Contents ?? []) {
      bytes += o.Size ?? 0;
      objectCount++;
    }
    if (!res.IsTruncated) break;
    continuationToken = res.NextContinuationToken;
  }
  return { bytes, objectCount };
}

export async function deleteR2Object(key: string) {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
    })
  );
}
