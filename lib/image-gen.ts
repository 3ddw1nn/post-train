// AI image-generation providers for Slideshow Studio's "AI Generated" slide
// source (see AI_MODELS in components/slideshow-studio.tsx). Plain fetch
// against each provider's HTTP API — same no-SDK idiom as lib/fal.ts and
// lib/creatify.ts. Callers resolve the API key first (workspace BYOK or env
// fallback — see lib/image-gen-keys.ts) and pass it in; this file has no
// DB/Convex dependency of its own. Nothing in the app calls generateImage()
// yet; the Launch button in Slideshow Studio has no handler at all currently
// (not specific to images — no studio job gets created from that step yet).
export type ImageGenModel = "gpt-image-2" | "nano-banana-2" | "seedream-5";
export type ImageGenProvider = "openai" | "gemini" | "ark";

export const MODEL_PROVIDER: Record<ImageGenModel, ImageGenProvider> = {
  "gpt-image-2": "openai",
  "nano-banana-2": "gemini",
  "seedream-5": "ark",
};

export type GeneratedImage = { bytes: Buffer; mime: string };

async function generateGptImage2(prompt: string, apiKey: string): Promise<GeneratedImage> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-image-2", prompt }),
  });
  if (!res.ok) {
    throw new Error(`GPT Image 2 failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("GPT Image 2 returned no image.");
  return { bytes: Buffer.from(b64, "base64"), mime: "image/png" };
}

async function generateNanoBanana2(prompt: string, apiKey: string): Promise<GeneratedImage> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) {
    throw new Error(`Nano Banana 2 failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Nano Banana 2 returned no image.");
  return { bytes: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType ?? "image/png" };
}

async function generateSeedream5(prompt: string, apiKey: string): Promise<GeneratedImage> {
  const res = await fetch("https://ark.ap-southeast.bytepluses.com/api/v3/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "seedream-5-0-pro",
      prompt,
      size: "2K",
      output_format: "png",
      watermark: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`SeeDream 5 failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { url?: string }[] };
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("SeeDream 5 returned no image.");
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Could not download SeeDream 5 output (${imgRes.status}).`);
  return {
    bytes: Buffer.from(await imgRes.arrayBuffer()),
    mime: imgRes.headers.get("content-type") ?? "image/png",
  };
}

/** Generates one image from a text prompt using a caller-supplied API key. */
export async function generateImage(model: ImageGenModel, prompt: string, apiKey: string): Promise<GeneratedImage> {
  switch (model) {
    case "gpt-image-2":
      return generateGptImage2(prompt, apiKey);
    case "nano-banana-2":
      return generateNanoBanana2(prompt, apiKey);
    case "seedream-5":
      return generateSeedream5(prompt, apiKey);
  }
}
