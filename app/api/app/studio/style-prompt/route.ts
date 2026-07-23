import { generateWithFreeAi, type ChatTurn } from "@/lib/free-ai";

function fallbackPrompt(body: Record<string, unknown>) {
  const aspect = typeof body.aspect === "string" ? body.aspect : "9:16";
  const overlay = body.overlays === "text" ? "with clean readable text-safe negative space" : "without text overlays";
  return `Editorial social slideshow style in ${aspect}, ${overlay}. Use cohesive lighting, clear subject focus, modern creator-style composition, soft natural contrast, and a consistent color palette. Keep every slide visually connected while leaving room for hook/caption pacing.`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const context = typeof body.context === "string" ? body.context.slice(0, 1200) : "";
  const campaignName = typeof body.campaignName === "string" ? body.campaignName.slice(0, 160) : "";
  const aspect = typeof body.aspect === "string" ? body.aspect : "9:16";
  const overlays = typeof body.overlays === "string" ? body.overlays : "none";
  const language = typeof body.language === "string" ? body.language : "English";
  const category = typeof body.category === "string" ? body.category.slice(0, 80) : "";
  const textStyle = typeof body.textStyle === "string" ? body.textStyle.slice(0, 80) : "";
  const textSize = typeof body.textSize === "string" ? body.textSize.slice(0, 40) : "";
  const textWidth = typeof body.textWidth === "string" ? body.textWidth.slice(0, 40) : "";
  const translationLanguage =
    typeof body.translationLanguage === "string" ? body.translationLanguage.slice(0, 80) : language;
  const referenceImageCount = Number(body.referenceImageCount ?? 0);
  const referenceImageNames = Array.isArray(body.referenceImageNames)
    ? body.referenceImageNames.filter((name): name is string => typeof name === "string").slice(0, 5)
    : [];
  const slideshowReference =
    typeof body.slideshowReference === "string"
      ? body.slideshowReference.slice(0, 500)
      : typeof body.tiktokReference === "string"
        ? body.tiktokReference.slice(0, 500)
        : "";

  const messages: ChatTurn[] = [
    {
      role: "system",
      content:
        "You write concise visual-style prompts for AI-generated social media slideshow images. Return only one polished prompt, 80-140 words. Include lighting, palette, composition, mood, typography/text-safe spacing if relevant, and consistency across slides. Do not mention credits, pricing, tools, or implementation.",
    },
    {
      role: "user",
      content: `Campaign: ${campaignName || "(untitled)"}
Context: ${context || "(none provided)"}
Category: ${category || "(unspecified)"}
Aspect ratio: ${aspect}
Overlay mode: ${overlays}
Text style: ${textStyle || "(default)"} · ${textSize || "default"} · ${textWidth || "default"}
Language: ${language}
Translation/output language: ${translationLanguage}
Reference images: ${referenceImageCount}${referenceImageNames.length ? ` (${referenceImageNames.join(", ")})` : ""}
Slideshow reference: ${slideshowReference || "(none)"}`,
    },
  ];

  const result = await generateWithFreeAi(messages, 420);
  if (result) return Response.json({ prompt: result.text, provider: result.provider });
  return Response.json({ prompt: fallbackPrompt(body), provider: "fallback" });
}
