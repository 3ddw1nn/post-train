import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { generateWithFreeAi, type ChatTurn } from "@/lib/free-ai";
import { platform as platformOf, CAPTION_MAX_BY_PLATFORM, CAPTION_MAX, HASHTAG_PLATFORMS } from "@/lib/platforms";

function fallbackCaption(campaignName: string, context: string, max: number) {
  const base = `${campaignName || "New post"} — ${context.split("\n")[0] || "swipe through for more"}`;
  return base.slice(0, max);
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e) {
    return jsonError(e);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const platformId = typeof body.platform === "string" ? body.platform : "";
  const context = typeof body.context === "string" ? body.context.slice(0, 1200) : "";
  const campaignName = typeof body.campaignName === "string" ? body.campaignName.slice(0, 160) : "";
  const length = body.length === "short" || body.length === "long" ? body.length : "medium";
  const format = body.format === "video" ? "video" : body.format === "post" ? "social post" : "slideshow";

  const p = platformOf(platformId);
  if (!p) {
    return Response.json({ error: { message: "Unknown platform." } }, { status: 400 });
  }
  if (!context.trim()) {
    return Response.json({ error: { message: "Add context first so there's something to write about." } }, { status: 400 });
  }

  const max = CAPTION_MAX_BY_PLATFORM[p.id] ?? CAPTION_MAX;
  const wantsHashtags = HASHTAG_PLATFORMS.includes(p.id);
  const target =
    length === "short" ? Math.min(120, Math.round(max * 0.3)) : length === "long" ? Math.round(max * 0.9) : Math.round(max * 0.55);
  const lengthInstruction =
    length === "short"
      ? `Keep it short and punchy — one brief sentence, well under ${target} characters.`
      : length === "long"
        ? `Write a fuller caption that makes good use of the space, aiming for close to ${target} characters.`
        : `Aim for a medium length, around ${target} characters.`;

  const messages: ChatTurn[] = [
    {
      role: "system",
      content: `You write a single ${p.name} caption for this ${format}. Match ${p.name}'s typical tone and formatting conventions. ${lengthInstruction} Stay at or under ${max} characters total, including any hashtags. ${
        wantsHashtags
          ? "End with 3-5 relevant, specific hashtags on their own line — no generic tags like #love or #instagood."
          : "Do not include hashtags."
      } Avoid generic AI-sounding filler phrases (e.g. "in today's fast-paced world", "let's dive in", "unlock the power of"). Return only the caption as plain text — no quotes, no markdown, no explanation.`,
    },
    {
      role: "user",
      content: `Campaign: ${campaignName || "(untitled)"}\n\nContent brief:\n${context}`,
    },
  ];

  const result = await generateWithFreeAi(messages, Math.min(500, Math.max(40, Math.ceil(target / 3))));
  if (result.rateLimited) {
    return Response.json(
      { error: { message: "You've used up today's free AI generations — try again later." } },
      { status: 429 }
    );
  }
  const text = (result.text ?? fallbackCaption(campaignName, context, max)).slice(0, max);
  return Response.json({ text, provider: result.text ? result.provider : "fallback" });
}
