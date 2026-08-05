// Threads publishing — creates a container via /threads, then publishes it
// via /threads_publish. Unlike Instagram, a text-only post is valid (no
// media required). Media (when present) needs a public URL, same as
// lib/instagram-publish.ts — callers pass the app's /api/media-file/:id
// redirect endpoint.
import { ThreadsError, type ThreadsCredentials } from "./threads";

const GRAPH_VERSION = "v1.0";
const GRAPH_URL = `https://graph.threads.net/${GRAPH_VERSION}`;

// Video containers process asynchronously; poll status until FINISHED
// before calling /threads_publish, or Threads rejects the publish call.
const VIDEO_POLL_INTERVAL_MS = 2000;
const VIDEO_POLL_MAX_ATTEMPTS = 30; // ~1 minute

export async function publishToThreads(
  creds: ThreadsCredentials,
  username: string,
  text: string,
  media?: { url: string; kind: "image" | "video" }
): Promise<{ platform_post_id: string; share_url: string }> {
  const mediaType = !media ? "TEXT" : media.kind === "video" ? "VIDEO" : "IMAGE";

  const createRes = await fetch(`${GRAPH_URL}/${creds.user_id}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: creds.access_token,
      media_type: mediaType,
      text,
      ...(media?.kind === "video" ? { video_url: media.url } : {}),
      ...(media?.kind === "image" ? { image_url: media.url } : {}),
    }),
  });
  const createJson = await createRes.json() as { id?: string; error?: { message?: string; code?: number } };
  if (!createRes.ok || !createJson.id) {
    const code = createJson.error?.code === 190 ? "auth_expired" : "platform_error";
    throw new ThreadsError(`Threads post creation failed: ${createJson.error?.message ?? "unknown error"}`, code);
  }
  const creationId = createJson.id;

  if (mediaType === "VIDEO") {
    let finished = false;
    for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
      const statusRes = await fetch(`${GRAPH_URL}/${creationId}?${new URLSearchParams({ fields: "status", access_token: creds.access_token })}`);
      const statusJson = await statusRes.json() as { status?: string };
      if (statusJson.status === "FINISHED") { finished = true; break; }
      if (statusJson.status === "ERROR") throw new ThreadsError("Threads failed to process the video.", "platform_error");
    }
    if (!finished) throw new ThreadsError("Threads video processing timed out.", "platform_error");
  }

  const publishRes = await fetch(`${GRAPH_URL}/${creds.user_id}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: creds.access_token, creation_id: creationId }),
  });
  const publishJson = await publishRes.json() as { id?: string; error?: { message?: string; code?: number } };
  if (!publishRes.ok || !publishJson.id) {
    const code = publishJson.error?.code === 190 ? "auth_expired" : "platform_error";
    throw new ThreadsError(`Threads publish failed: ${publishJson.error?.message ?? "unknown error"}`, code);
  }

  const permalinkRes = await fetch(`${GRAPH_URL}/${publishJson.id}?${new URLSearchParams({ fields: "permalink", access_token: creds.access_token })}`);
  const permalinkJson = permalinkRes.ok ? await permalinkRes.json() as { permalink?: string } : {};
  return { platform_post_id: publishJson.id, share_url: permalinkJson.permalink ?? `https://www.threads.net/@${username}/post/${publishJson.id}` };
}
