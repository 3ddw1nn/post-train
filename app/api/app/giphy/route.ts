import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";

type GiphyRendition = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyItem = {
  id?: string;
  title?: string;
  images?: {
    original?: GiphyRendition;
    downsized?: GiphyRendition;
    fixed_width_small?: GiphyRendition;
    fixed_width?: GiphyRendition;
  };
};

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60_000;

function consumeRateLimit(key: string, limit: number) {
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function giphyMediaUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value ?? ""));
    const hostAllowed = url.hostname === "media.giphy.com"
      || url.hostname === "i.giphy.com"
      || /^media\d+\.giphy\.com$/i.test(url.hostname);
    return url.protocol === "https:" && hostAllowed ? url : null;
  } catch {
    return null;
  }
}

async function readBodyWithinLimit(response: Response, maxBytes: number): Promise<ArrayBuffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function GET(req: Request) {
  const user = await requireUser();
  await currentWorkspace(user);
  if (!consumeRateLimit(`${user.id}:giphy-search`, 80)) {
    return Response.json({ error: { message: "Too many GIF searches. Try again in a minute." } }, { status: 429 });
  }

  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return Response.json({ error: { message: "GIPHY search isn’t configured. Add GIPHY_API_KEY to .env.local and restart the app." } }, { status: 503 });
  }

  const requestUrl = new URL(req.url);
  const query = (requestUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const type = requestUrl.searchParams.get("type") === "stickers" ? "stickers" : "gifs";
  const offset = integerParam(requestUrl.searchParams.get("offset"), 0, 0, 5_000);
  const limit = integerParam(requestUrl.searchParams.get("limit"), 24, 1, 30);
  const operation = query ? "search" : "trending";
  const upstream = new URL(`https://api.giphy.com/v1/${type}/${operation}`);
  upstream.searchParams.set("api_key", apiKey);
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("offset", String(offset));
  upstream.searchParams.set("rating", "g");
  upstream.searchParams.set("lang", "en");
  if (query) upstream.searchParams.set("q", query);

  let response: Response;
  try {
    response = await fetch(upstream, { cache: "no-store" });
  } catch {
    return Response.json({ error: { message: "Couldn’t reach GIPHY. Check your connection and try again." } }, { status: 502 });
  }
  const payload = await response.json().catch(() => null) as { data?: GiphyItem[]; pagination?: { total_count?: number; count?: number; offset?: number }; meta?: { msg?: string } } | null;
  if (!response.ok || !payload?.data) {
    return Response.json({ error: { message: payload?.meta?.msg || "GIPHY couldn’t complete this search." } }, { status: response.status >= 400 && response.status < 500 ? response.status : 502 });
  }

  const data = payload.data.flatMap((item) => {
    const id = String(item.id ?? "");
    const original = giphyMediaUrl(item.images?.original?.url);
    const preview = giphyMediaUrl(item.images?.fixed_width_small?.url)
      ?? giphyMediaUrl(item.images?.fixed_width?.url)
      ?? giphyMediaUrl(item.images?.downsized?.url)
      ?? original;
    if (!id || !original || !preview) return [];
    const width = Number(item.images?.original?.width);
    const height = Number(item.images?.original?.height);
    return [{
      id,
      title: String(item.title || (type === "stickers" ? "GIPHY sticker" : "GIPHY GIF")),
      url: original.toString(),
      preview_url: preview.toString(),
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
      source: "giphy" as const,
      attribution: "Powered by GIPHY" as const,
    }];
  });

  const upstreamCount = Math.max(0, Number(payload.pagination?.count) || data.length);
  const total = Math.max(0, Number(payload.pagination?.total_count) || data.length);
  return Response.json({
    data,
    pagination: {
      offset,
      count: data.length,
      total,
      next_offset: offset + upstreamCount,
      has_more: offset + upstreamCount < total,
    },
  });
}

export async function POST(req: Request) {
  const user = await requireUser();
  await currentWorkspace(user);
  if (!consumeRateLimit(`${user.id}:giphy-import`, 20)) {
    return Response.json({ error: { message: "Too many GIF imports. Try again in a minute." } }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const mediaUrl = giphyMediaUrl(body?.url);
  if (!mediaUrl) {
    return Response.json({ error: { message: "Choose a valid GIF from GIPHY." } }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(mediaUrl, { cache: "no-store", redirect: "follow" });
  } catch {
    return Response.json({ error: { message: "Couldn’t download this GIF from GIPHY." } }, { status: 502 });
  }
  if (!response.ok || !giphyMediaUrl(response.url)) {
    return Response.json({ error: { message: "GIPHY couldn’t provide this GIF." } }, { status: 502 });
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "image/gif") {
    return Response.json({ error: { message: "GIPHY returned an unsupported image format." } }, { status: 415 });
  }
  const declaredSize = Number(response.headers.get("content-length"));
  const maxBytes = 25 * 1024 * 1024;
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    return Response.json({ error: { message: "This GIF is larger than the 25 MB import limit." } }, { status: 413 });
  }
  let bytes: ArrayBuffer | null;
  try {
    bytes = await readBodyWithinLimit(response, maxBytes);
  } catch {
    return Response.json({ error: { message: "Couldn’t download this GIF from GIPHY." } }, { status: 502 });
  }
  if (!bytes) {
    return Response.json({ error: { message: "This GIF is larger than the 25 MB import limit." } }, { status: 413 });
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
