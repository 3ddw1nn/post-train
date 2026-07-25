// Workspace "bring your own key" storage for the third-party AI image
// providers in lib/image-gen.ts. Credentials are encrypted at rest with the
// same AES-256-GCM helper (lib/secretbox.ts) that protects connected social
// accounts' OAuth tokens, and only ever decrypted server-side by
// resolveProviderKey — never returned to the client.
import { api } from "@/convex/_generated/api";
import { convexQuery, deleteRecord, findRecord, insertRecord, now, patchRecord, recordById, uid } from "./db";
import { encryptJson, decryptJson } from "./secretbox";
import { DomainError } from "./posts";
import type { ImageGenProvider } from "./image-gen";

export const PROVIDERS: { id: ImageGenProvider; label: string; envVar: string; consoleUrl: string }[] = [
  { id: "openai", label: "OpenAI (GPT Image 2)", envVar: "OPENAI_API_KEY", consoleUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google Gemini (Nano Banana 2)", envVar: "GEMINI_API_KEY", consoleUrl: "https://aistudio.google.com/app/apikey" },
  { id: "ark", label: "BytePlus Ark (SeeDream 5)", envVar: "ARK_API_KEY", consoleUrl: "https://console.byteplus.com/ark" },
];

type KeyRow = { id: string; workspace_id: string; provider: string; credentials: string; last4: string; created_at: string };

function assertProvider(provider: string): asserts provider is ImageGenProvider {
  if (!PROVIDERS.some((p) => p.id === provider)) {
    throw new DomainError(400, "Unknown provider.");
  }
}

export async function listImageGenKeys(workspaceId: string): Promise<Omit<KeyRow, "credentials">[]> {
  return await convexQuery<Omit<KeyRow, "credentials">[]>(api.imageGenKeys.listForWorkspace, {
    workspace_id: workspaceId,
  });
}

export async function saveImageGenKey(workspaceId: string, provider: string, apiKey: string): Promise<void> {
  assertProvider(provider);
  const trimmed = apiKey.trim();
  if (!trimmed) throw new DomainError(400, "Paste a key first.");

  const credentials = encryptJson({ apiKey: trimmed });
  const last4 = trimmed.slice(-4);
  const existing = await findRecord<KeyRow>("image_gen_keys", { workspace_id: workspaceId, provider });
  if (existing) {
    await patchRecord("image_gen_keys", existing.id, { credentials, last4, created_at: now() });
  } else {
    await insertRecord("image_gen_keys", { id: uid(), workspace_id: workspaceId, provider, credentials, last4, created_at: now() });
  }
}

export async function deleteImageGenKey(workspaceId: string, id: string): Promise<void> {
  const row = await recordById<KeyRow>("image_gen_keys", id);
  if (!row || row.workspace_id !== workspaceId) {
    throw new DomainError(404, "Key not found.");
  }
  await deleteRecord("image_gen_keys", id);
}

/** Workspace-stored key first, falling back to the operator's own env var. */
export async function resolveProviderKey(workspaceId: string, provider: ImageGenProvider): Promise<string | null> {
  const row = await findRecord<KeyRow>("image_gen_keys", { workspace_id: workspaceId, provider });
  if (row) return decryptJson<{ apiKey: string }>(row.credentials).apiKey;
  const envVar = PROVIDERS.find((p) => p.id === provider)!.envVar;
  return process.env[envVar] ?? null;
}

/** For UI status badges — does this provider resolve to *some* key (workspace or env)? */
export async function providerConfigured(workspaceId: string, provider: ImageGenProvider): Promise<boolean> {
  return (await resolveProviderKey(workspaceId, provider)) !== null;
}
