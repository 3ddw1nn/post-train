import { v } from "convex/values";
import { mutation, query, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Reuses the same free-model fallback chain as the support chat: try each until
// one returns. Keys live in Convex env (GEMINI_API_KEY, GROQ_API_KEY, …).
type AiProvider = { label: string; envName: string; baseUrl: string; model: string };

const AI_PROVIDERS: AiProvider[] = [
  { label: "Gemini", envName: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
  { label: "Groq", envName: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "Cerebras", envName: "CEREBRAS_API_KEY", baseUrl: "https://api.cerebras.ai/v1", model: "gpt-oss-120b" },
  { label: "Mistral", envName: "MISTRAL_API_KEY", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  { label: "OpenRouter", envName: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
];

type ChatTurn = { role: "system" | "user"; content: string };

async function callProvider(provider: AiProvider, key: string, messages: ChatTurn[]): Promise<string> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: provider.model, messages, max_tokens: 900, temperature: 0.5 }),
  });
  if (!response.ok) throw new Error(`${provider.label} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${provider.label} returned empty`);
  return content;
}

// Split "SUMMARY: … PLAN: …" into two fields; tolerant of a missing PLAN marker.
function parseOutput(raw: string): { summary: string; plan: string } {
  const planIdx = raw.search(/\n?\s*PLAN\s*:/i);
  if (planIdx === -1) {
    return { summary: raw.replace(/^\s*SUMMARY\s*:/i, "").trim(), plan: "" };
  }
  const summary = raw.slice(0, planIdx).replace(/^\s*SUMMARY\s*:/i, "").trim();
  const plan = raw.slice(planIdx).replace(/^\n?\s*PLAN\s*:/i, "").trim();
  return { summary, plan };
}

// Public: read the cached recreation for a content item (null if never generated).
export const get = query({
  args: { contentKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trend_recreations")
      .withIndex("by_content_key", (q) => q.eq("content_key", args.contentKey))
      .first();
  },
});

// Public: request a recreation. If one already exists (pending/complete) it's a
// no-op — first click generates, everyone after reuses the cached result.
export const request = mutation({
  args: {
    contentKey: v.string(),
    title: v.string(),
    platform: v.string(),
    format: v.string(), // "video" | "photo" | "text"
    caption: v.string(),
    stats: v.string(),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trend_recreations")
      .withIndex("by_content_key", (q) => q.eq("content_key", args.contentKey))
      .first();
    if (existing && existing.status !== "error") return existing._id;

    if (existing) await ctx.db.delete(existing._id); // retry a failed one

    const rowId = await ctx.db.insert("trend_recreations", {
      content_key: args.contentKey,
      status: "pending",
      summary: "",
      plan: "",
      provider: null,
      title: args.title.slice(0, 200),
      platform: args.platform,
    });

    await ctx.scheduler.runAfter(0, internal.trendRecreations.generate, { rowId, ...args });
    return rowId;
  },
});

export const finish = internalMutation({
  args: {
    rowId: v.id("trend_recreations"),
    status: v.string(),
    summary: v.string(),
    plan: v.string(),
    provider: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.rowId, {
      status: args.status,
      summary: args.summary,
      plan: args.plan,
      provider: args.provider,
    });
  },
});

export const generate = internalAction({
  args: {
    rowId: v.id("trend_recreations"),
    contentKey: v.string(),
    title: v.string(),
    platform: v.string(),
    format: v.string(),
    caption: v.string(),
    stats: v.string(),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const system =
      "You are a social-media content strategist. Given a trending post from another creator, produce (1) a tight 1-2 sentence SUMMARY of what the content is and why it's working, then (2) a concrete, numbered PLAN a creator could follow to make their own version in the same format — hook, structure, shot/section list or copy beats, and a call to action. Be specific and practical; no fluff, no preamble. Format EXACTLY as:\nSUMMARY: <text>\nPLAN:\n1. <step>\n2. <step>\n…";
    const user = `Platform: ${args.platform}
Format: ${args.format}
Title: ${args.title}
Caption / text: ${args.caption || "(none)"}
Engagement: ${args.stats}
Original: ${args.sourceUrl}`;

    const messages: ChatTurn[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    for (const provider of AI_PROVIDERS) {
      const key = process.env[provider.envName];
      if (!key) continue;
      try {
        const raw = await callProvider(provider, key, messages);
        const { summary, plan } = parseOutput(raw);
        await ctx.runMutation(internal.trendRecreations.finish, {
          rowId: args.rowId,
          status: "complete",
          summary,
          plan,
          provider: provider.label,
        });
        return null;
      } catch (err) {
        console.error(`trend recreation: ${provider.label} failed`, err);
      }
    }

    await ctx.runMutation(internal.trendRecreations.finish, {
      rowId: args.rowId,
      status: "error",
      summary: "",
      plan: "Couldn't reach the AI service just now. Try again in a moment.",
      provider: null,
    });
    return null;
  },
});
