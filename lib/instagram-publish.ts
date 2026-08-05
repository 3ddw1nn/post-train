// Instagram publishing — creates a media container via /media, then
// publishes it via /media_publish. IG requires the image/video to already be
// reachable at a public URL (no raw byte upload), so callers pass the app's
// /api/media-file/:id redirect endpoint as image_url/video_url.
//
// Works for both connect paths in lib/instagram.ts (Facebook Page token) and
// lib/instagram-direct.ts (direct Instagram Login) — they differ only in
// which Graph API host serves the account's token.
import { InstagramError, type InstagramCredentials } from "./instagram";

const GRAPH_VERSION = "v21.0";

// Video containers process asynchronously; poll status_code until FINISHED
// before calling /media_publish, or Instagram rejects the publish call.
const VIDEO_POLL_INTERVAL_MS = 2000;
const VIDEO_POLL_MAX_ATTEMPTS = 30; // ~1 minute

function graphUrl(creds: InstagramCredentials) {
  return creds.via === "direct" ? `https://graph.instagram.com/${GRAPH_VERSION}` : `https://graph.facebook.com/${GRAPH_VERSION}`;
}

export async function publishToInstagram(
  creds: InstagramCredentials,
  caption: string,
  media: { url: string; kind: "image" | "video" }
): Promise<{ platform_post_id: string; share_url: string }> {
  const graphApi = graphUrl(creds);
  const isVideo = media.kind === "video";

  const createRes = await fetch(`${graphApi}/${creds.ig_user_id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: creds.access_token,
      caption,
      ...(isVideo ? { media_type: "REELS", video_url: media.url } : { image_url: media.url }),
    }),
  });
  const createJson = await createRes.json() as { id?: string; error?: { message?: string; code?: number } };
  if (!createRes.ok || !createJson.id) {
    const code = createJson.error?.code === 190 ? "auth_expired" : "platform_error";
    throw new InstagramError(`Instagram media creation failed: ${createJson.error?.message ?? "unknown error"}`, code);
  }
  const creationId = createJson.id;

  if (isVideo) {
    let finished = false;
    for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
      const statusRes = await fetch(`${graphApi}/${creationId}?${new URLSearchParams({ fields: "status_code", access_token: creds.access_token })}`);
      const statusJson = await statusRes.json() as { status_code?: string };
      if (statusJson.status_code === "FINISHED") { finished = true; break; }
      if (statusJson.status_code === "ERROR") throw new InstagramError("Instagram failed to process the video.", "platform_error");
    }
    if (!finished) throw new InstagramError("Instagram video processing timed out.", "platform_error");
  }

  const publishRes = await fetch(`${graphApi}/${creds.ig_user_id}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: creds.access_token, creation_id: creationId }),
  });
  const publishJson = await publishRes.json() as { id?: string; error?: { message?: string; code?: number } };
  if (!publishRes.ok || !publishJson.id) {
    const code = publishJson.error?.code === 190 ? "auth_expired" : "platform_error";
    throw new InstagramError(`Instagram publish failed: ${publishJson.error?.message ?? "unknown error"}`, code);
  }

  const permalinkRes = await fetch(`${graphApi}/${publishJson.id}?${new URLSearchParams({ fields: "permalink", access_token: creds.access_token })}`);
  const permalinkJson = permalinkRes.ok ? await permalinkRes.json() as { permalink?: string } : {};
  return { platform_post_id: publishJson.id, share_url: permalinkJson.permalink ?? `https://www.instagram.com/p/${publishJson.id}/` };
}
