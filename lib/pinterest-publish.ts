// Pinterest publishing — creates pins via the Pins API.
// Pins can include images or video. Text becomes the pin description.
export type PinterestCredentials = {
  access_token: string;
  expires_at: number;
};

class PinterestError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error"
  ) {
    super(message);
  }
}

export function isPinterestError(e: unknown): e is PinterestError {
  return e instanceof PinterestError;
}

export async function publishToPinterest(
  creds: PinterestCredentials,
  description: string,
  mediaUrl: string
): Promise<{ platform_post_id: string; share_url: string }> {
  // Pinterest requires a board to pin to. For MVP, we'll use the user's
  // "Saved" board (all users have this). In the future, users can select
  // their preferred board from the UI.
  const boardId = "saved"; // Special ID for the Saved board

  // ponytail: Using Pins API v5 (latest). Requires board_id + media URL.
  // Images must be JPEG/PNG, video must be MP4. We only support images for MVP.

  const pinData = {
    media: {
      media_type: "image",
      items: [
        {
          url: mediaUrl, // Pinned from this URL
        },
      ],
    },
    description,
  };

  const res = await fetch(`https://api.pinterest.com/v5/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pinData),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) {
      throw new PinterestError("Pinterest access token expired", "auth_expired");
    }
    throw new PinterestError(
      `Pinterest pin creation failed: ${errText}`,
      "platform_error"
    );
  }

  const json = (await res.json()) as {
    id: string;
  };

  return {
    platform_post_id: json.id,
    share_url: `https://pinterest.com/pin/${json.id}/`,
  };
}
