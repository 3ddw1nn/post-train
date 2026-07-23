// Shared free-tier text generation chain — tries each configured provider in
// order and returns the first success. Used by studio style-prompt and
// context-rewrite generation; falls back to a caller-supplied template when
// no provider key is configured or all providers fail.
type FreeAiProvider = { label: string; envName: string; baseUrl: string; model: string };
export type ChatTurn = { role: "system" | "user"; content: string };

export const FREE_AI_PROVIDERS: FreeAiProvider[] = [
  {
    label: "Gemini",
    envName: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
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

async function callFreeAiProvider(provider: FreeAiProvider, key: string, messages: ChatTurn[], maxTokens: number) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens, temperature: 0.6 }),
  });
  if (!response.ok) {
    throw new Error(`${provider.label} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${provider.label} returned empty`);
  return content;
}

/** Tries each configured free-tier provider in order; null if none configured or all failed. */
export async function generateWithFreeAi(
  messages: ChatTurn[],
  maxTokens = 420,
): Promise<{ text: string; provider: string } | null> {
  for (const provider of FREE_AI_PROVIDERS) {
    const key = process.env[provider.envName];
    if (!key) continue;
    try {
      const text = await callFreeAiProvider(provider, key, messages, maxTokens);
      return { text, provider: provider.label };
    } catch (err) {
      console.error(`free-ai: ${provider.label} failed`, err);
    }
  }
  return null;
}
