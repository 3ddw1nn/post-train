// AES-256-GCM encryption for platform credentials at rest.
// Standalone (no next/headers import chain) so the worker can decrypt during publish.
// Reads the same .data/secret file as lib/auth.ts signing.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

/**
 * 32-byte app secret. In production set PT_SECRET (64 hex chars — `openssl rand -hex 32`):
 * the container filesystem is ephemeral, so the dev fallback file would rotate on every
 * deploy, invalidating sessions and stored credentials.
 */
export function secretKey(): Buffer {
  if (process.env.PT_SECRET) return Buffer.from(process.env.PT_SECRET.trim(), "hex");
  const file = path.join(DATA_DIR, "secret");
  if (!existsSync(file)) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(file, "utf8").trim(), "hex");
}
const key = secretKey;

export function encryptJson(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptJson<T>(box: string): T {
  const [iv, tag, ct] = box.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")) as T;
}
