// Extracts public media (caption, author, all photo slides) from an Instagram
// or TikTok post. Tries providers in order and returns the first that yields
// data: Apify (full carousel) → RapidAPI (fallback) → Open Graph tags (cover +
// caption only). Every provider reads PUBLIC data with no viewer credentials,
// so private posts can never be pulled.

export type ExtractSource = "apify" | "rapidapi" | "opengraph";
export type ExtractedPost = {
  platform: "Instagram" | "TikTok";
  author: string;
  caption: string;
  images: string[];
  sourceUrl: string;
  source: ExtractSource;
};

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const MAX_IMAGES = 10; // Instagram carousels cap at 10 slides.

// SSRF guard: the URL is user-supplied, so only these hosts are ever fetched or
// forwarded to a provider. Anything else (localhost, internal IPs, other
// domains) is rejected before any request is made.
function classifyUrl(raw: string): { platform: ExtractedPost["platform"]; url: URL } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^m\./, "").replace(/^www\./, "");
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return { platform: "Instagram", url };
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return { platform: "TikTok", url };
  return null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic)(\?|$)/i;
const IMAGE_HOST_RE = /(cdninstagram|scontent|tiktokcdn|ibyteimg|muscdn|byteoversea)/i;
const IMAGE_JUNK_RE = /(profile_pic|static\.cdninstagram|rsrc\.php|\/s150x150\/|\/s320x320\/|avatar|sprite)/i;

// Recursively harvests photo-like URLs from an arbitrary provider payload —
// resilient to schema differences between actors and RapidAPI vendors.
function collectImageUrls(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    const s = node;
    if (/^https?:\/\//.test(s) && (IMAGE_EXT_RE.test(s) || IMAGE_HOST_RE.test(s)) && !IMAGE_JUNK_RE.test(s)) {
      out.push(s);
    }
  } else if (Array.isArray(node)) {
    for (const v of node) collectImageUrls(v, out);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectImageUrls(v, out);
  }
  return out;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function dedupeImages(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean))).slice(0, MAX_IMAGES);
}

// Best single image URL from one Instagram media node (highest-res candidate).
function bestCandidate(media: Record<string, unknown>): string {
  const iv2 = media.image_versions2 as { candidates?: { url?: string }[] } | undefined;
  const first = iv2?.candidates?.[0]?.url;
  if (typeof first === "string") return first;
  return firstString(media, ["display_url", "thumbnail_url", "displayUrl"]);
}

async function postJson(url: string, body: unknown, timeoutMs = 60_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------- Apify ---------------------------------- */

// Runs a public Apify actor synchronously and returns its dataset items.
async function runApifyActor(actorId: string, input: unknown): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return [];
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const items = (await postJson(url, input, 60_000)) as unknown;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

async function fromApify(platform: ExtractedPost["platform"], url: string): Promise<Partial<ExtractedPost> | null> {
  if (!process.env.APIFY_TOKEN) return null;

  if (platform === "Instagram") {
    const items = await runApifyActor("apify~instagram-scraper", {
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    });
    const item = items[0];
    if (!item) return null;
    const children = Array.isArray(item.childPosts) ? (item.childPosts as Record<string, unknown>[]) : [];
    const images = dedupeImages([
      ...(typeof item.displayUrl === "string" ? [item.displayUrl] : []),
      ...(Array.isArray(item.images) ? (item.images as string[]) : []),
      ...children.flatMap((c) => [
        typeof c.displayUrl === "string" ? c.displayUrl : "",
        ...(Array.isArray(c.images) ? (c.images as string[]) : []),
      ]),
    ]);
    return { author: firstString(item, ["ownerUsername", "ownerFullName"]), caption: firstString(item, ["caption"]), images };
  }

  const items = await runApifyActor("clockworks~tiktok-scraper", {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
  });
  const item = items[0];
  if (!item) return null;
  const author =
    (item.authorMeta as Record<string, unknown> | undefined)?.name?.toString() ||
    (item.authorMeta as Record<string, unknown> | undefined)?.nickName?.toString() ||
    "";
  return { author, caption: firstString(item, ["text", "title"]), images: dedupeImages(collectImageUrls(item)) };
}

/* -------------------------------- RapidAPI -------------------------------- */

async function getRapidApi(host: string, path: string): Promise<unknown> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`https://${host}${path}`, {
      signal: controller.signal,
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fromRapidApi(platform: ExtractedPost["platform"], url: string): Promise<Partial<ExtractedPost> | null> {
  if (!process.env.RAPIDAPI_KEY) return null;

  if (platform === "Instagram") {
    // Default target: instagram-scraper-api2 (override with RAPIDAPI_IG_HOST).
    const host = process.env.RAPIDAPI_IG_HOST || "instagram-scraper-api2.p.rapidapi.com";
    const json = (await getRapidApi(host, `/v1/post_info?code_or_id_or_url=${encodeURIComponent(url)}`)) as
      | { data?: Record<string, unknown> }
      | null;
    const data = json?.data;
    if (!data) return null;
    const caption =
      typeof data.caption === "string"
        ? data.caption
        : firstString((data.caption as Record<string, unknown>) ?? {}, ["text"]);
    const author =
      firstString((data.user as Record<string, unknown>) ?? {}, ["username"]) ||
      firstString((data.owner as Record<string, unknown>) ?? {}, ["username"]);
    // Take the best single candidate per carousel slide (the candidates array is
    // just resolutions of the same image). Fall back to harvesting if the shape
    // is unexpected.
    const carousel = Array.isArray(data.carousel_media) ? (data.carousel_media as Record<string, unknown>[]) : null;
    const media = carousel ?? [data];
    let images = dedupeImages(media.map(bestCandidate).filter(Boolean) as string[]);
    if (!images.length) images = dedupeImages(collectImageUrls(data));
    return { author, caption, images };
  }

  const host = process.env.RAPIDAPI_TIKTOK_HOST || "tiktok-scraper7.p.rapidapi.com";
  const json = (await getRapidApi(host, `/?url=${encodeURIComponent(url)}&hd=1`)) as
    | { data?: Record<string, unknown> }
    | null;
  const data = json?.data ?? (json as Record<string, unknown> | null);
  if (!data) return null;
  const author = firstString((data.author as Record<string, unknown>) ?? {}, ["unique_id", "nickname"]);
  return { author, caption: firstString(data, ["title", "desc"]), images: dedupeImages(collectImageUrls(data)) };
}

/* ------------------------------- Open Graph ------------------------------- */

function metaContent(html: string, property: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const val = m[1] ?? m[2];
    if (val) out.push(decodeEntities(val));
  }
  return out;
}

function parseCaption(ogTitle: string, ogDescription: string): string {
  const quoted = ogTitle.match(/:\s*[""](.+)[""]\s*$/s) ?? ogDescription.match(/:\s*[""](.+)[""]\s*$/s);
  if (quoted?.[1]) return quoted[1].trim();
  const stripped = ogDescription.replace(/^[\d,.]+\s+likes?,\s+[\d,.]+\s+comments?\s+-\s+[^:]+:\s*/i, "");
  return (stripped || ogDescription || ogTitle).trim();
}

async function fromOpenGraph(platform: ExtractedPost["platform"], url: string): Promise<Partial<ExtractedPost> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": MOBILE_UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const ogImages = metaContent(html, "og:image");
  const ogTitle = metaContent(html, "og:title")[0] ?? "";
  const ogDescription = metaContent(html, "og:description")[0] ?? "";
  const embedded = (html.match(/https:\/\/scontent[^"'\\ ]*t51[^"'\\ ]*\.jpg[^"'\\ ]*/g) ?? []).map((s) =>
    decodeEntities(s.replace(/\\u0026/g, "&").replace(/\\\//g, "/")),
  );
  const images = dedupeImages(
    [...ogImages, ...embedded].filter((u) => /^https:\/\//.test(u) && !IMAGE_JUNK_RE.test(u)),
  );
  const author = ogTitle.match(/^(.+?)\s+on\s+(?:Instagram|TikTok)/i)?.[1]?.trim() ?? platform;
  return { author, caption: parseCaption(ogTitle, ogDescription), images };
}

/* -------------------------------- pipeline -------------------------------- */

export async function extractPost(rawUrl: string): Promise<ExtractedPost> {
  const classified = classifyUrl(rawUrl);
  if (!classified) {
    throw new Error("Please paste a public Instagram or TikTok post link.");
  }
  const { platform, url } = classified;
  const sourceUrl = url.toString();

  const providers: [ExtractSource, (p: typeof platform, u: string) => Promise<Partial<ExtractedPost> | null>][] = [
    ["apify", fromApify],
    ["rapidapi", fromRapidApi],
    ["opengraph", fromOpenGraph],
  ];

  for (const [source, fn] of providers) {
    try {
      const r = await fn(platform, sourceUrl);
      if (r && ((r.images && r.images.length) || (r.caption && r.caption.trim()))) {
        return {
          platform,
          author: r.author?.trim() || platform,
          caption: r.caption?.trim() ?? "",
          images: (r.images ?? []).slice(0, MAX_IMAGES),
          sourceUrl,
          source,
        };
      }
    } catch (e) {
      console.error(`social-extract: ${source} failed`, e);
    }
  }

  // No provider returned public data — a private/removed post (or a fully
  // blocked one) lands here. We never send credentials, so this is the correct
  // "public only" outcome.
  throw new Error("That post isn't publicly available. Only public Instagram or TikTok posts can be copied.");
}
