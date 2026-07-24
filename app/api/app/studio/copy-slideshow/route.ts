import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { jsonError } from "@/lib/api-auth";
import { extractPost } from "@/lib/social-extract";
import { generateWithFreeAi, type ChatTurn } from "@/lib/free-ai";
import { importFromUrl, mediaFileUrl } from "@/lib/media";

const MAX_IMPORTED_IMAGES = 5;

// Instagram/TikTok CDN URLs are signed and expire, so they're unusable for a
// draft that gets resumed later — pull the bytes into our own media library
// (R2-backed, same as any upload) and hand back our stable URL instead. Best
// effort per image: one host being unreachable shouldn't fail the whole copy.
async function rehostImages(workspaceId: string, urls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    urls.slice(0, MAX_IMPORTED_IMAGES).map((url) => importFromUrl(workspaceId, url)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof importFromUrl>>> => r.status === "fulfilled")
    .map((r) => mediaFileUrl(r.value.id));
}

// Apify's synchronous actor run can take up to ~60s for a cold start.
export const maxDuration = 60;

const SYSTEM_PROMPT =
  "You turn a public social media post into a concise creative brief for recreating it as an original slideshow. In 60-120 words, describe the topic, the hook, the tone, and a suggested slide-by-slide angle. Write your own words — do not copy the caption verbatim, and do not reproduce anyone's private information. Plain text only, no headers or markdown.";

function fallbackContext(caption: string, author: string, platform: string) {
  const base = caption.trim() || `A ${platform} post by ${author}`;
  return `Recreate the idea behind this ${platform} post as an original slideshow.\n\nSource angle:\n${base}\n\nKeep it hook-first, make each slide carry one clear point, and match the tone without copying the original wording or imagery.`;
}

export async function POST(req: Request) {
  let workspaceId: string;
  try {
    const user = await requireUser();
    workspaceId = (await currentWorkspace(user)).id;
  } catch (e) {
    return jsonError(e);
  }

  const body = (await req.json().catch(() => ({}))) as { url?: unknown; acknowledged?: unknown };
  const url = typeof body.url === "string" ? body.url : "";
  if (!url.trim()) {
    return Response.json({ error: { message: "Paste a post link first." } }, { status: 400 });
  }
  // The user must accept the content-responsibility acknowledgment before we
  // fetch anything on their behalf.
  if (body.acknowledged !== true) {
    return Response.json({ error: { message: "Please accept the content policy to continue." } }, { status: 400 });
  }

  let post;
  try {
    post = await extractPost(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't read that post.";
    return Response.json({ error: { message } }, { status: 422 });
  }

  const userText = `Platform: ${post.platform}
Author: ${post.author}
Caption: ${post.caption || "(no caption)"}`;

  // Primary path: vision — analyze the cover image alongside the caption. Falls
  // back to caption-only synthesis when no vision provider is available.
  let generated = await (async () => {
    if (!post.images[0]) return null;
    const visionMessages: ChatTurn[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: `${userText}\n\nThe attached image is the post's cover. Factor in what it shows.` },
          { type: "image_url", image_url: { url: post.images[0] } },
        ],
      },
    ];
    return generateWithFreeAi(visionMessages, 320, { visionOnly: true });
  })();
  const analyzedImage = !!generated?.text;
  if (!generated?.text) {
    generated = await generateWithFreeAi(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText },
      ],
      320,
    );
  }

  if (!generated.text && generated.rateLimited) {
    return Response.json(
      { error: { message: "You've used up today's free AI generations — try again later." } },
      { status: 429 }
    );
  }

  const context = generated.text?.slice(0, 1200) ?? fallbackContext(post.caption, post.author, post.platform);
  const images = await rehostImages(workspaceId, post.images);

  return Response.json({
    platform: post.platform,
    author: post.author,
    caption: post.caption,
    images,
    context,
    analyzedImage,
    extractedVia: post.source,
    provider: generated.text ? generated.provider : "fallback",
  });
}
