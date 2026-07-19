// TikTok publishing — uploads videos via the TikTok Content Posting API.
// Videos are posted as drafts by default (user can publish manually).
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

export async function publishToTikTok(
  creds: TikTokCredentials,
  videoBytes: Buffer,
  caption: string
): Promise<{ platform_post_id: string; share_url: string }> {
  // ponytail: TikTok's Content Posting API requires:
  // 1. POST to /v1/post/publish/action/upload (returns upload_url)
  // 2. PUT video bytes to upload_url
  // 3. POST to /v1/post/publish/action/submit (initiates processing)
  //
  // Videos are created as drafts. Users can publish manually from TikTok's app.
  // Publish status can be checked via /v1/post/publish/status/{video_id}

  // Step 1: Request upload URL
  const initRes = await fetch(
    "https://open.tiktokapis.com/v1/post/publish/action/upload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_info: {
          source: "FILE_UPLOAD",
          file_size: videoBytes.length,
        },
      }),
    }
  );

  if (!initRes.ok) {
    throw new TikTokError(
      `TikTok upload init failed: ${await initRes.text()}`,
      "platform_error"
    );
  }

  const initJson = (await initRes.json()) as {
    data?: {
      upload_url: string;
      publish_id: string;
    };
  };

  if (!initJson.data?.upload_url || !initJson.data?.publish_id) {
    throw new TikTokError("No TikTok upload URL provided", "platform_error");
  }

  const uploadUrl = initJson.data.upload_url;
  const publishId = initJson.data.publish_id;

  // Step 2: Upload video bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoBytes.length),
    },
    body: new Uint8Array(videoBytes),
  });

  if (!uploadRes.ok) {
    throw new TikTokError(
      `TikTok video upload failed: ${await uploadRes.text()}`,
      "platform_error"
    );
  }

  // Step 3: Submit for processing (creates as draft)
  const submitRes = await fetch(
    "https://open.tiktokapis.com/v1/post/publish/action/submit",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        media_type: "VIDEO",
        publish_id: publishId,
        caption,
        post_mode: "DRAFT", // Saves as draft, not publicly posted
      }),
    }
  );

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    if (errText.includes("rate_limit")) {
      throw new TikTokError(
        "TikTok rate limit exceeded",
        "platform_error"
      );
    }
    throw new TikTokError(
      `TikTok submit failed: ${errText}`,
      "platform_error"
    );
  }

  const submitJson = (await submitRes.json()) as {
    data?: {
      video_id: string;
    };
  };

  if (!submitJson.data?.video_id) {
    throw new TikTokError("No TikTok video ID returned", "platform_error");
  }

  const videoId = submitJson.data.video_id;

  return {
    platform_post_id: videoId,
    share_url: `https://www.tiktok.com/@[username]/video/${videoId}`,
  };
}
