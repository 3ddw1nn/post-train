import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-auth";
import { DomainError } from "@/lib/posts";
import { VOICES } from "@/lib/replicate-avatar";
import { synthesizeVoicePreview } from "@/lib/voice-preview";

export async function GET(req: Request) {
  try {
    await requireUser();
    const voice = new URL(req.url).searchParams.get("voice") ?? "";
    if (!VOICES.includes(voice as (typeof VOICES)[number])) {
      throw new DomainError(400, "Unknown voice.");
    }
    const wav = await synthesizeVoicePreview(voice);
    return new Response(new Uint8Array(wav), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
