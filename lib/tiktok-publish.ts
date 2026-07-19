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

// ── Direct-post (video.publish scope) — built ahead, not live yet ──────────
// Not wired into lib/publish.ts. Calling this today will fail with
// scope_not_authorized: the OAuth flow only requests video.upload, and even
// once video.publish is requested, TikTok forces every post from it to
// SELF_ONLY (private) until the app passes their separate content-posting
// audit. See docs/TODO.md §12 for the activation checklist.

export type TikTokCreatorInfo = {
  username: string;
  nickname: string;
  avatarUrl: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

// TikTok requires querying this immediately before every direct post — it's
// how you get the privacy levels this specific creator is allowed to use,
// and it's also what a required pre-post consent screen shows the user
// (username/avatar) before they confirm.
export async function fetchTikTokCreatorInfo(
  accessToken: string
): Promise<TikTokCreatorInfo> {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    }
  );

  const json = (await res.json()) as {
    data?: {
      creator_username: string;
      creator_nickname: string;
      creator_avatar_url: string;
      privacy_level_options: string[];
      comment_disabled: boolean;
      duet_disabled: boolean;
      stitch_disabled: boolean;
      max_video_post_duration_sec: number;
    };
    error?: { code: string; message: string };
  };

  if (!res.ok || !json.data) {
    const code = json.error?.code === "access_token_invalid" ? "auth_expired" : "platform_error";
    throw new TikTokError(
      `TikTok creator info query failed: ${json.error?.message ?? "unknown error"}`,
      code
    );
  }

  return {
    username: json.data.creator_username,
    nickname: json.data.creator_nickname,
    avatarUrl: json.data.creator_avatar_url,
    privacyLevelOptions: json.data.privacy_level_options,
    commentDisabled: json.data.comment_disabled,
    duetDisabled: json.data.duet_disabled,
    stitchDisabled: json.data.stitch_disabled,
    maxVideoPostDurationSec: json.data.max_video_post_duration_sec,
  };
}

export type TikTokDirectPostOptions = {
  caption: string;
  /** Must be one of TikTokCreatorInfo.privacyLevelOptions for this creator. */
  privacyLevel: string;
  disableDuet?: boolean;
  disableStitch?: boolean;
  disableComment?: boolean;
};

export async function publishToTikTokDirect(
  creds: TikTokCredentials,
  videoBytes: Buffer,
  options: TikTokDirectPostOptions
): Promise<{ platform_post_id: string; share_url: string }> {
  if (videoBytes.length > MAX_SINGLE_CHUNK_BYTES) {
    throw new TikTokError(
      `Video too large for TikTok direct post (${(videoBytes.length / 1024 / 1024).toFixed(1)}MB, max 64MB supported).`,
      "platform_error"
    );
  }

  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: options.caption,
        privacy_level: options.privacyLevel,
        disable_duet: !!options.disableDuet,
        disable_stitch: !!options.disableStitch,
        disable_comment: !!options.disableComment,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoBytes.length,
        chunk_size: videoBytes.length,
        total_chunk_count: 1,
      },
    }),
  });

  const initJson = (await initRes.json()) as {
    data?: { publish_id: string; upload_url: string };
    error?: { code: string; message: string };
  };

  if (!initRes.ok || !initJson.data?.upload_url) {
    const code = initJson.error?.code === "access_token_invalid" ? "auth_expired" : "platform_error";
    throw new TikTokError(
      `TikTok direct post init failed: ${initJson.error?.message ?? "unknown error"}`,
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
    share_url: "", // Real URL isn't known until TikTok finishes processing; fetch via status poll if needed.
  };
}
