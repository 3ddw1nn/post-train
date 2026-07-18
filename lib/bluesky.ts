// Real Bluesky (AT Protocol) integration — the first non-simulated platform.
// Auth: app passwords (https://bsky.app/settings/app-passwords), no OAuth app
// registration needed. Credentials stored AES-encrypted on social_accounts.
//
// ponytail: images only for now (Bluesky's video pipeline needs a separate
// upload service + processing poll). Video posts fail with a clear error.

const DEFAULT_SERVICE = "https://bsky.social";
const MAX_POST_CHARS = 300; // Bluesky grapheme limit
const MAX_IMAGES = 4;
const MAX_BLOB_BYTES = 1_000_000; // ~976KB per-blob API limit

export type BlueskyCredentials = {
  identifier: string; // handle or email used to sign in
  appPassword: string;
  service?: string;
};

type Session = { accessJwt: string; did: string; handle: string; service: string };

class BlueskyError extends Error {
  constructor(
    message: string,
    public code: "auth_expired" | "platform_error" | "unsupported_media"
  ) {
    super(message);
  }
}

async function xrpc<T>(
  service: string,
  method: string,
  opts: { token?: string; json?: unknown; body?: Buffer; contentType?: string; query?: Record<string, string> }
): Promise<T> {
  const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
  const res = await fetch(`${service}/xrpc/${method}${qs}`, {
    method: opts.json !== undefined || opts.body !== undefined ? "POST" : "GET",
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.contentType ? { "Content-Type": opts.contentType } : {}),
    },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : (opts.body as BodyInit | undefined),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    const detail = err?.message || err?.error || `HTTP ${res.status}`;
    if (res.status === 401 || err?.error === "AuthenticationRequired" || err?.error === "AccountTakedown") {
      throw new BlueskyError(`Bluesky sign-in failed: ${detail}`, "auth_expired");
    }
    throw new BlueskyError(`Bluesky error on ${method}: ${detail}`, "platform_error");
  }
  return (await res.json()) as T;
}

export async function blueskyLogin(creds: BlueskyCredentials): Promise<Session> {
  const service = creds.service || DEFAULT_SERVICE;
  const session = await xrpc<{ accessJwt: string; did: string; handle: string }>(
    service,
    "com.atproto.server.createSession",
    { json: { identifier: creds.identifier, password: creds.appPassword } }
  );
  return { ...session, service };
}

export async function blueskyProfile(session: Session): Promise<{ displayName: string | null; avatar: string | null }> {
  const profile = await xrpc<{ displayName?: string; avatar?: string }>(
    session.service,
    "app.bsky.actor.getProfile",
    { token: session.accessJwt, query: { actor: session.did } }
  );
  return { displayName: profile.displayName ?? null, avatar: profile.avatar ?? null };
}

export type BlueskyPublishResult = { platform_post_id: string; share_url: string };

export async function publishToBluesky(
  creds: BlueskyCredentials,
  text: string,
  media: { bytes: Buffer; mime: string; kind: string }[]
): Promise<BlueskyPublishResult> {
  if (media.some((m) => m.kind !== "image")) {
    throw new BlueskyError("Bluesky video/PDF publishing isn't supported yet — images only.", "unsupported_media");
  }
  const session = await blueskyLogin(creds);

  const images = [];
  for (const m of media.slice(0, MAX_IMAGES)) {
    if (m.bytes.byteLength > MAX_BLOB_BYTES) {
      throw new BlueskyError(
        `Bluesky images must be under 1MB (got ${(m.bytes.byteLength / 1024 / 1024).toFixed(1)}MB).`,
        "unsupported_media"
      );
    }
    const uploaded = await xrpc<{ blob: unknown }>(session.service, "com.atproto.repo.uploadBlob", {
      token: session.accessJwt,
      body: m.bytes,
      contentType: m.mime,
    });
    images.push({ image: uploaded.blob, alt: "" });
  }

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: [...text].slice(0, MAX_POST_CHARS).join(""),
    createdAt: new Date().toISOString(),
    ...(images.length ? { embed: { $type: "app.bsky.embed.images", images } } : {}),
  };
  const created = await xrpc<{ uri: string }>(session.service, "com.atproto.repo.createRecord", {
    token: session.accessJwt,
    json: { repo: session.did, collection: "app.bsky.feed.post", record },
  });

  // uri: at://did:plc:xxx/app.bsky.feed.post/<rkey>
  const rkey = created.uri.split("/").pop()!;
  return {
    platform_post_id: created.uri,
    share_url: `https://bsky.app/profile/${session.handle}/post/${rkey}`,
  };
}

export function isBlueskyError(e: unknown): e is BlueskyError {
  return e instanceof BlueskyError;
}
