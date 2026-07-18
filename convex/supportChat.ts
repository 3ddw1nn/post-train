import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const MAX_MESSAGE_LENGTH = 2000;
const MODEL_HISTORY_LIMIT = 16;
const LIST_LIMIT = 60;

export const listForSession = query({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("support_messages")
      .withIndex("by_session", (q) => q.eq("session_key", args.sessionKey))
      .order("desc")
      .take(LIST_LIMIT);
    return rows.reverse();
  },
});

export const sendMessage = mutation({
  args: { sessionKey: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    const content = args.content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!content) throw new ConvexError("Say something first.");

    const last = await ctx.db
      .query("support_messages")
      .withIndex("by_session", (q) => q.eq("session_key", args.sessionKey))
      .order("desc")
      .first();
    if (last?.role === "assistant" && last.status === "pending") {
      throw new ConvexError("Still working on the last reply — hang tight.");
    }

    await ctx.db.insert("support_messages", {
      session_key: args.sessionKey,
      role: "user",
      content,
      status: "complete",
      provider: null,
    });
    const assistantMessageId = await ctx.db.insert("support_messages", {
      session_key: args.sessionKey,
      role: "assistant",
      content: "",
      status: "pending",
      provider: null,
    });

    await ctx.scheduler.runAfter(0, internal.supportChat.generateReply, {
      sessionKey: args.sessionKey,
      assistantMessageId,
    });
    return null;
  },
});

export const clearSession = mutation({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("support_messages")
      .withIndex("by_session", (q) => q.eq("session_key", args.sessionKey))
      .take(200);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});

export const getRecentForGeneration = internalQuery({
  args: { sessionKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("support_messages")
      .withIndex("by_session", (q) => q.eq("session_key", args.sessionKey))
      .order("desc")
      .take(MODEL_HISTORY_LIMIT + 4);
    return rows
      .reverse()
      .filter((m) => m.status === "complete")
      .slice(-MODEL_HISTORY_LIMIT);
  },
});

export const finishReply = internalMutation({
  args: {
    messageId: v.id("support_messages"),
    content: v.string(),
    status: v.string(),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: args.status,
      provider: args.provider ?? null,
    });
    return null;
  },
});

type ChatProvider = { label: string; envName: string; baseUrl: string; model: string };

const CHAT_PROVIDERS: ChatProvider[] = [
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

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

async function callProvider(provider: ChatProvider, key: string, messages: ChatTurn[]): Promise<string> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: 700,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider.label} ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${provider.label} returned an empty response`);
  return content;
}

function buildSystemPrompt(sessionKey: string): string {
  const isVisitor = sessionKey.startsWith("anon:");

  const appKnowledge = `You are the support assistant for Post Train, a social media cross-posting and scheduling app.

WHAT THE APP DOES:
- Upload content once and cross-post it to Twitter/X, Instagram, LinkedIn, Facebook, TikTok, YouTube, Bluesky, Threads, Pinterest, and Google Business from one dashboard.
- Schedule posts for later, or add them to a posting queue with fixed daily time slots.
- Supports text, images (including carousels), video, and stories (Facebook & Instagram), with per-platform tweaks like YouTube titles or TikTok draft mode.
- Syncs post analytics (views, likes, comments, shares) back from each platform.
- Supports workspaces and team members with roles.
- Offers an API and MCP server so AI agents (e.g. Claude) can manage posts.

WHAT USERS CAN DO:
- Connect social accounts via each platform's official OAuth sign-in (no passwords stored).
- Create a post, pick destination accounts, and publish immediately, schedule it, or drop it in the queue.
- Manage billing and plan from Settings → Billing.
- Invite teammates to a workspace.

PLANS AND LIMITS:
- Free: 5 total posts, a small number of connected accounts, no per-channel pricing.
- Creator: 15 connected accounts.
- Growth: 50 connected accounts.
- Pro: unlimited connected accounts and posts.
- All paid plans are unlimited on posts; cancel anytime; refunds within 7 days of any charge, no interview required.
- Scheduled posts go out through each platform's official API, so they are not penalized versus posting manually.

HARD RULES:
- Be direct, concise, and plain-spoken. Answer in short paragraphs of plain text.
- Only make claims about features listed above.
- If you don't know whether the app does something, say so plainly instead of guessing.
- Never ask for passwords, tokens, full payment details, or private keys.
- When pointing somewhere in the app, name the page or workflow instead of inventing a URL.`;

  if (isVisitor) {
    return `${appKnowledge}

THIS CONVERSATION:
You're chatting with a visitor on the public marketing site who has not signed up yet. Help them decide whether Post Train fits their needs, and suggest starting a free trial at /create-account when it's relevant. You have no knowledge of any specific account, workspace, or billing state — don't invent any.`;
  }

  return `${appKnowledge}

THIS CONVERSATION:
You're chatting with a signed-in Post Train user inside the app dashboard. You don't have access to their specific account data (connected accounts, post history, billing state) — if the question needs that, tell them where to look (e.g. Settings → Billing, or the relevant dashboard page) instead of guessing at their state.`;
}

export const generateReply = internalAction({
  args: { sessionKey: v.string(), assistantMessageId: v.id("support_messages") },
  handler: async (ctx, args) => {
    const history = await ctx.runQuery(internal.supportChat.getRecentForGeneration, {
      sessionKey: args.sessionKey,
    });

    const messages: ChatTurn[] = [
      { role: "system", content: buildSystemPrompt(args.sessionKey) },
      ...history.map((m): ChatTurn => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    ];

    for (const provider of CHAT_PROVIDERS) {
      const key = process.env[provider.envName];
      if (!key) continue;
      try {
        const content = await callProvider(provider, key, messages);
        await ctx.runMutation(internal.supportChat.finishReply, {
          messageId: args.assistantMessageId,
          content,
          status: "complete",
          provider: provider.label,
        });
        return null;
      } catch (err) {
        console.error(`support chat: ${provider.label} failed`, err);
      }
    }

    await ctx.runMutation(internal.supportChat.finishReply, {
      messageId: args.assistantMessageId,
      content: "I couldn't reach the AI service just now. Give it a minute and try again.",
      status: "error",
    });
    return null;
  },
});
