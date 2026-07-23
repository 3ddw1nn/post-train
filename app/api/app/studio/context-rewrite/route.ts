import { generateWithFreeAi, type ChatTurn } from "@/lib/free-ai";

function fallbackRewrite(context: string, category: string, language: string, slideCount: number) {
  return `Create a ${category.toLowerCase()} slideshow for ${language} viewers.\n\nCore idea:\n${context}\n\nMake it hook-first, specific, and easy to turn into ${slideCount} swipeable slides.`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const context = typeof body.context === "string" ? body.context.slice(0, 1200) : "";
  const campaignName = typeof body.campaignName === "string" ? body.campaignName.slice(0, 160) : "";
  const category = typeof body.category === "string" ? body.category.slice(0, 80) : "General";
  const language = typeof body.language === "string" ? body.language : "English";
  const slideCount = Number(body.slideCount ?? 5);

  if (!context.trim()) {
    return Response.json({ error: { message: "Add some context first." } }, { status: 400 });
  }

  const messages: ChatTurn[] = [
    {
      role: "system",
      content:
        "You rewrite short briefs into sharp, hook-first content briefs for social media slideshows. Return only the rewritten brief as plain text, 60-140 words. Make it specific and easy to split into slides. Do not add headers, markdown, or explanations.",
    },
    {
      role: "user",
      content: `Campaign: ${campaignName || "(untitled)"}
Category: ${category}
Language: ${language}
Target slide count: ${slideCount}

Original brief:
${context}`,
    },
  ];

  const result = await generateWithFreeAi(messages, 300);
  if (result) return Response.json({ text: result.text, provider: result.provider });
  return Response.json({ text: fallbackRewrite(context, category, language, slideCount), provider: "fallback" });
}
