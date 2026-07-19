// TikTok publishing — uploads videos to the creator's TikTok inbox as a
// draft via the Content Posting API (video.upload scope). The creator must
// open TikTok and manually finish posting; the API does not set a caption
// or title in this mode.
//
// Direct-to-profile publishing (video.publish scope) is not implemented —
// it requires a separate, stricter TikTok content-posting audit (privacy
// level selector, duet/stitch/comment controls, creator info shown before
// posting) that we haven't built the UI for yet.
export type TikTokCredentials = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};

class TikTokError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}

export function isTikTokError(e: unknown): e is TikTokError {
  return e instanceof TikTokError;
}

// ponytail: single-chunk upload only. TikTok requires 5-64MB chunks for
// larger files; upgrade path is the chunked PUT loop from TikTok's media
// transfer guide if videos routinely exceed this.
const MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024;

export async function publishToTikTok(
  creds: TikTokCredentials,
  videoBytes: Buffer
): Promise<{ platform_post_id: string; share_url: string }> {
  if (videoBytes.length > MAX_SINGLE_CHUNK_BYTES) {
    throw new TikTokError(
      `Video too large for TikTok draft upload (${(videoBytes.length / 1024 / 1024).toFixed(1)}MB, max 64MB supported).`,
      "platform_error"
    );
  }

  const initRes = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoBytes.length,
          chunk_size: videoBytes.length,
          total_chunk_count: 1,
        },
      }),
    }
  );

  const initJson = (await initRes.json()) as {
    data?: { publish_id: string; upload_url: string };
    error?: { code: string; message: string };
  };

  if (!initRes.ok || !initJson.data?.upload_url) {
    const code = initJson.error?.code === "access_token_invalid" ? "auth_expired" : "platform_error";
    throw new TikTokError(
      `TikTok upload init failed: ${initJson.error?.message ?? "unknown error"}`,
      code
    );
  }

  const { publish_id, upload_url } = initJson.data;

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoBytes.length - 1}/${videoBytes.length}`,
    },
    body: new Uint8Array(videoBytes),
  });

  if (!uploadRes.ok) {
    throw new TikTokError(
      `TikTok video upload failed: ${await uploadRes.text()}`,
      "platform_error"
    );
  }

  return {
    platform_post_id: publish_id,
    // Draft uploads have no public URL until the creator manually posts from the TikTok app.
    share_url: "",
  };
}
