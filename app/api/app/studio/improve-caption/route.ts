import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { generateWithFreeAi, type ChatTurn } from "@/lib/free-ai";
import { platform as platformOf, CAPTION_MAX_BY_PLATFORM, CAPTION_MAX } from "@/lib/platforms";

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e) {
    return jsonError(e);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const platformId = typeof body.platform === "string" ? body.platform : "";
  const text = typeof body.text === "string" ? body.text.slice(0, 3000) : "";
  const flagged = Array.isArray(body.flagged) ? body.flagged.filter((s): s is string => typeof s === "string") : [];

  const p = platformOf(platformId);
  if (!p) {
    return Response.json({ error: { message: "Unknown platform." } }, { status: 400 });
  }
  if (!text.trim()) {
    return Response.json({ error: { message: "Nothing to improve yet." } }, { status: 400 });
  }

  const max = CAPTION_MAX_BY_PLATFORM[p.id] ?? CAPTION_MAX;

  const messages: ChatTurn[] = [
    {
      role: "system",
      content: `You rewrite a ${p.name} post caption so it reads like a real person wrote it, not an AI. Cut generic filler phrases${
        flagged.length ? ` (especially: ${flagged.join(", ")})` : ""
      }, tighten the wording, and keep the same core message, length ballpark, and any hashtags. Stay at or under ${max} characters. Return only the rewritten caption as plain text — no quotes, no markdown, no explanation.`,
    },
    { role: "user", content: text },
  ];

  const result = await generateWithFreeAi(messages, Math.min(500, Math.ceil(max / 3)));
  if (result.rateLimited) {
    return Response.json(
      { error: { message: "You've used up today's free AI generations — try again later." } },
      { status: 429 }
    );
  }
  if (!result.text) {
    return Response.json({ error: { message: "Couldn't reach an AI provider right now." } }, { status: 502 });
  }
  return Response.json({ text: result.text.slice(0, max), provider: result.provider });
}
