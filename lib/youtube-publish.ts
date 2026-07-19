// YouTube publishing — uploads videos via the YouTube Data API v3.
// Videos are posted as unlisted by default (set to public after verification).
import { Readable } from "node:stream";

export type YouTubeCredentials = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};

class YouTubeError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error" | "credits_depleted"
  ) {
    super(message);
  }
}

export function isYouTubeError(e: unknown): e is YouTubeError {
  return e instanceof YouTubeError;
}

async function ensureValidToken(
  creds: YouTubeCredentials
): Promise<YouTubeCredentials> {
  // If token is still valid for 5+ minutes, use it as-is
  if (creds.expires_at > Date.now() + 5 * 60_000) {
    return creds;
  }

  // Token expired or expiring soon — refresh it
  if (!creds.refresh_token) {
    throw new YouTubeError(
      "YouTube access token expired and no refresh token available",
      "auth_expired"
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  });

  if (!res.ok) {
    throw new YouTubeError(
      "Could not refresh YouTube access token",
      "auth_expired"
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    access_token: json.access_token,
    refresh_token: creds.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
}

export async function publishToYouTube(
  creds: YouTubeCredentials,
  videoBytes: Buffer,
  title: string,
  description: string
): Promise<{ platform_post_id: string; share_url: string; refreshedCreds?: YouTubeCredentials }> {
  // Ensure token is fresh
  let freshCreds = creds;
  if (creds.expires_at <= Date.now()) {
    freshCreds = await ensureValidToken(creds);
  }

  // ponytail: YouTube requires multipart upload for videos. For now, we'll
  // use the simpler resumable upload API. Videos are posted as "unlisted"
  // by default — users can change visibility in YouTube Studio after posting.

  const metadata = {
    snippet: {
      title: title || "Post Train Video",
      description: description || "",
      tags: ["social-media", "post-train"],
      categoryId: "22", // People & Blogs
    },
    status: {
      privacyStatus: "unlisted", // Users can make public later
      embeddable: true,
    },
  };

  // Initiate resumable upload session
  const sessionRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${freshCreds.access_token}`,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!sessionRes.ok) {
    const errText = await sessionRes.text();
    if (errText.includes("insufficientQuota")) {
      throw new YouTubeError(
        "YouTube quota exceeded — try again tomorrow",
        "credits_depleted"
      );
    }
    throw new YouTubeError(
      `YouTube upload initiation failed: ${errText}`,
      "platform_error"
    );
  }

  const sessionUri = sessionRes.headers.get("location");
  if (!sessionUri) {
    throw new YouTubeError("YouTube upload session not created", "platform_error");
  }

  // Upload the video file
  const uploadRes = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(videoBytes.length),
    },
    body: new Uint8Array(videoBytes),
  });

  if (!uploadRes.ok) {
    throw new YouTubeError(
      `YouTube video upload failed: ${await uploadRes.text()}`,
      "platform_error"
    );
  }

  const uploadedVideo = (await uploadRes.json()) as {
    id: string;
    snippet?: { title: string };
  };

  return {
    platform_post_id: uploadedVideo.id,
    share_url: `https://youtu.be/${uploadedVideo.id}`,
    refreshedCreds: freshCreds !== creds ? freshCreds : undefined,
  };
}
