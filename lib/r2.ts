import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_UPLOAD_TTL_SECONDS = 15 * 60;
const R2_DOWNLOAD_TTL_SECONDS = 60 * 60;

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

export function mediaObjectKey(workspaceId: string, mediaId: string) {
  return `workspaces/${workspaceId}/media/${mediaId}`;
}

export function exploreObjectKey(itemId: string, slideIndex: number) {
  return `explore/${itemId}/slide-${slideIndex}.jpg`;
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
  const publicBase = r2PublicBaseUrl();
  if (publicBase) return `${publicBase}/${key}`;
  return await getSignedUrl(
    r2Client(),
    new GetObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
    }),
    { expiresIn: R2_DOWNLOAD_TTL_SECONDS }
  );
}

export async function deleteR2Object(key: string) {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
    })
  );
}
