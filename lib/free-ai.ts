// Shared free-tier text generation chain — tries each configured provider in
// order and returns the first success. Used by studio context-rewrite and
// platform-caption generation; falls back to a caller-supplied template when
// no provider key is configured or all providers fail.
// `vision: true` marks providers whose model can read image_url content parts.
type FreeAiProvider = { label: string; envName: string; baseUrl: string; model: string; vision?: boolean };
// OpenAI-style content: a plain string, or multimodal parts (text + images).
type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatTurn = { role: "system" | "user"; content: string | ContentPart[] };

export const FREE_AI_PROVIDERS: FreeAiProvider[] = [
  {
    label: "Gemini",
    envName: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    vision: true,
  },
  {
    label: "Groq",
    envName: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  {
    label: "Cerebras",
    envName: "CEREBRAS_API_KEY",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "gpt-oss-120b",
  },
  {
    label: "Mistral",
    envName: "MISTRAL_API_KEY",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
  },
  {
    label: "OpenRouter",
    envName: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
];

// Thrown specifically for 429s, so generateWithFreeAi can tell "every
// provider's free-tier quota is exhausted today" apart from other failures
// (bad key, network blip, empty response) that should just fall back quietly.
class RateLimitError extends Error {}

async function callFreeAiProvider(provider: FreeAiProvider, key: string, messages: ChatTurn[], maxTokens: number) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens, temperature: 0.6 }),
  });
  if (!response.ok) {
    const detail = `${provider.label} ${response.status}: ${(await response.text()).slice(0, 200)}`;
    if (response.status === 429) throw new RateLimitError(detail);
    throw new Error(detail);
  }
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${provider.label} returned empty`);
  return content;
}

export type FreeAiResult =
  | { text: string; provider: string; rateLimited?: never }
  | { text: null; rateLimited: boolean };

/**
 * Tries each configured free-tier provider in order. Pass `visionOnly` when
 * the messages contain images — only vision-capable providers are attempted.
 * On total failure, `rateLimited: true` means every provider that was tried
 * hit its free-tier quota (429) — a real "come back later" situation, worth
 * surfacing to the user — versus `false`, which covers everything else
 * (no keys configured, a provider outage, a malformed response) and is
 * meant to fall back to a template quietly, same as before.
 */
export async function generateWithFreeAi(
  messages: ChatTurn[],
  maxTokens = 420,
  opts: { visionOnly?: boolean } = {},
): Promise<FreeAiResult> {
  const providers = opts.visionOnly ? FREE_AI_PROVIDERS.filter((p) => p.vision) : FREE_AI_PROVIDERS;
  let attempted = 0;
  let allRateLimited = true;
  for (const provider of providers) {
    const key = process.env[provider.envName];
    if (!key) continue;
    attempted++;
    try {
      const text = await callFreeAiProvider(provider, key, messages, maxTokens);
      return { text, provider: provider.label };
    } catch (err) {
      if (!(err instanceof RateLimitError)) allRateLimited = false;
      console.error(`free-ai: ${provider.label} failed`, err);
    }
  }
  return { text: null, rateLimited: attempted > 0 && allRateLimited };
}
