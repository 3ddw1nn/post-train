import { NextResponse } from "next/server";

type TrendPlatform = "youtube" | "bluesky" | "mastodon";

type TrendCard = {
  id: string;
  platform: TrendPlatform;
  platformIconId: TrendPlatform;
  source: string;
  title: string;
  creator: string;
  caption: string;
  category: string;
  format: "video" | "slideshow" | "source";
  aspect: "vertical" | "wide" | "square" | "portrait";
  isShort?: boolean;
  tags: string[];
  thumbnail?: string;
  videoId?: string;
  slides: number;
  postedAt: string;
  publishedAt?: string;
  authorAvatar?: string;
  followers: string;
  sourceUrl: string;
  stats: {
    views: string;
    likes: string;
    comments: string;
    shares: string;
    saves?: string;
  };
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
    tags?: string[];
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  status?: {
    madeForKids?: boolean;
    selfDeclaredMadeForKids?: boolean;
  };
};

type BlueskyPostView = {
  uri?: string;
  author?: {
    handle?: string;
    displayName?: string;
    avatar?: string;
    followersCount?: number;
  };
  record?: {
    text?: string;
    createdAt?: string;
  };
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  quoteCount?: number;
  indexedAt?: string;
  embed?: {
    $type?: string;
    images?: { thumb?: string; fullsize?: string; alt?: string; aspectRatio?: { width?: number; height?: number } }[];
    external?: { thumb?: string; title?: string; description?: string; uri?: string };
    thumbnail?: string;
    aspectRatio?: { width?: number; height?: number };
  };
};

type MastodonStatus = {
  id?: string;
  url?: string;
  created_at?: string;
  content?: string;
  favourites_count?: number;
  replies_count?: number;
  reblogs_count?: number;
  account?: {
    acct?: string;
    username?: string;
    display_name?: string;
    avatar?: string;
    followers_count?: number;
  };
  media_attachments?: {
    preview_url?: string;
    url?: string;
    type?: string;
    meta?: { original?: { width?: number; height?: number } };
  }[];
  tags?: { name?: string }[];
};

const API_PLATFORMS: TrendPlatform[] = ["youtube", "bluesky", "mastodon"];
// Source tokens accepted from the client. "youtube-shorts" is a YouTube fetch
// variant (kind=shorts), not a distinct platform. "All" defaults to the regulars.
const API_SOURCES = ["youtube", "youtube-shorts", "bluesky", "mastodon"] as const;
type ApiSource = (typeof API_SOURCES)[number];
const DEFAULT_SOURCES: ApiSource[] = ["youtube", "bluesky", "mastodon"];
const YOUTUBE_PAGE_SIZE = 40;
const MASTODON_PAGE_SIZE = 40;
const BLUESKY_WHATS_HOT_FEED = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";

function compactNumber(value?: string | number) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function cleanText(value?: string) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDate(value?: string) {
  if (!value) return "Live result";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

// The Data API exposes no "is a Short" flag. /shorts/{id} is the reliable tell:
// a real (vertical) Short returns 200; a regular video 303-redirects to /watch.
async function isRealYouTubeShort(videoId: string) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      next: { revalidate: 60 * 60 * 24 }, // short-vs-not never changes
    });
    clearTimeout(timer);
    return res.status === 200;
  } catch {
    return false;
  }
}

// Only runs in Shorts mode. The #shorts search still returns some regular videos,
// so confirm each via the /shorts URL and drop the non-Shorts — every card kept
// is a genuine vertical Short.
async function keepRealShorts(cards: TrendCard[]): Promise<TrendCard[]> {
  const real = await Promise.all(
    cards.map((card) => (card.videoId ? isRealYouTubeShort(card.videoId) : Promise.resolve(false))),
  );
  return cards.filter((_, i) => real[i]);
}

// asShort decides formatting outright: regular YouTube videos are always wide
// (16:9), Shorts are always vertical. No per-video detection on the main path.
function youtubeToTrendCard(item: YouTubeVideoItem, asShort: boolean): TrendCard | null {
  const videoId = item.id;
  if (!videoId || !item.snippet?.title) return null;

  return {
    id: `youtube-${videoId}`,
    platform: "youtube",
    platformIconId: "youtube",
    source: asShort ? "YouTube Shorts" : "YouTube Data API",
    title: item.snippet.title,
    creator: item.snippet.channelTitle ? `@${item.snippet.channelTitle}` : "YouTube",
    caption:
      item.snippet.description?.slice(0, 180) ||
      "Live YouTube result. Use the watch pattern, hook, pacing, and comments for content inspiration.",
    category: asShort ? "Short-form" : "YouTube Video",
    format: "video",
    aspect: asShort ? "vertical" : "wide",
    isShort: asShort,
    tags: (item.snippet.tags ?? []).slice(0, 4),
    thumbnail:
      item.snippet.thumbnails?.high?.url ??
      item.snippet.thumbnails?.medium?.url ??
      item.snippet.thumbnails?.default?.url,
    videoId,
    slides: 1,
    postedAt: compactDate(item.snippet.publishedAt),
    publishedAt: item.snippet.publishedAt,
    followers: "YouTube channel",
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    stats: {
      views: compactNumber(item.statistics?.viewCount),
      likes: compactNumber(item.statistics?.likeCount),
      comments: compactNumber(item.statistics?.commentCount),
      shares: "Embed",
      saves: "—",
    },
  };
}

type YouTubeOpts = {
  query?: string;
  pageToken?: string;
  shorts?: boolean;
  region: string;
  hideKids: boolean;
};

// ponytail: YouTube's official madeForKids/selfDeclaredMadeForKids flag is a
// COPPA legal-compliance signal, not a "features/appeals to kids" signal — most
// family-vlog, kid-reaction, and toy/candy channels never self-flag it, so relying
// on it alone under-filters exactly the content "hide kids" is meant to catch.
// Layer a text heuristic on title/description/tags/channel as a second signal.
// Ceiling: word-list heuristics both miss phrasing they don't cover and can
// false-positive on unrelated uses of a word; upgrade path is a real classifier
// or YouTube's audience/topic metadata if that becomes available.
const KIDS_CONTENT_PATTERN =
  /\b(kids?|toddlers?|preschool(er)?s?|nursery\s*rhymes?|for\s*children|diapers?|babies|baby|cocomelon|blippi|peppa\s*pig|paw\s*patrol|school\s*[^a-z]*(life|girl|boy|flex|shopping|prank)|family\s*[^a-z]*(vlog|shorts?))\b/i;

function isMadeForKids(item: YouTubeVideoItem) {
  if (item.status?.madeForKids || item.status?.selfDeclaredMadeForKids) return true;
  const haystack = [item.snippet?.title, item.snippet?.description, item.snippet?.channelTitle, ...(item.snippet?.tags ?? [])]
    .filter(Boolean)
    .join(" ");
  return KIDS_CONTENT_PATTERN.test(haystack);
}

// Channel avatars aren't in the video snippet — one batched channels.list call
// (1 quota unit, cached a day) maps channelId → avatar for the whole page.
async function fetchYouTubeChannelAvatars(channelIds: string[], key: string) {
  const map = new Map<string, string>();
  const ids = [...new Set(channelIds)].slice(0, 50);
  if (ids.length === 0) return map;
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return map;
    const data = (await res.json()) as {
      items?: { id?: string; snippet?: { thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } }[];
    };
    for (const it of data.items ?? []) {
      const avatar = it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url;
      if (it.id && avatar) map.set(it.id, avatar);
    }
  } catch {
    /* avatars are best-effort */
  }
  return map;
}

async function buildYouTubeCards(items: YouTubeVideoItem[], key: string, opts: YouTubeOpts) {
  const built: { card: TrendCard; channelId?: string }[] = [];
  for (const item of items) {
    if (opts.hideKids && isMadeForKids(item)) continue;
    const card = youtubeToTrendCard(item, Boolean(opts.shorts));
    if (card) built.push({ card, channelId: item.snippet?.channelId });
  }
  const avatars = await fetchYouTubeChannelAvatars(
    built.map((b) => b.channelId).filter((id): id is string => Boolean(id)),
    key,
  );
  for (const b of built) if (b.channelId) b.card.authorAvatar = avatars.get(b.channelId);
  const cards = built.map((b) => b.card);
  return opts.shorts ? keepRealShorts(cards) : cards;
}

async function fetchYouTubeVideos(ids: string[], key: string, opts: YouTubeOpts) {
  if (ids.length === 0) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics,status");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("maxResults", String(YOUTUBE_PAGE_SIZE));
  url.searchParams.set("key", key);

  const response = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!response.ok) throw new Error(`YouTube videos failed: ${response.status}`);
  const data = (await response.json()) as { items?: YouTubeVideoItem[] };
  return buildYouTubeCards(data.items ?? [], key, opts);
}

// YouTube caps pagination *per query* (~7-8 pages before it stops sending a
// nextPageToken). To go deeper we fan out across query variants — different search
// seeds, sort orders, and trending regions — each of which has its own pool. The
// client dedupes by video id, so overlap never surfaces as a duplicate; we order
// phases most-distinct-first (varied seeds/regions before re-sorts) to minimise it.
type YtPhase =
  | { kind: "chart"; region: string }
  | { kind: "search"; q: string; order: string; region: string; short: boolean };

const SHORTS_SEEDS = [
  "#shorts",
  "#shortsfeed",
  "#ytshorts",
  "#viralshorts",
  "#trendingshorts",
  "#funnyshorts",
  "#shortsvideo",
  "#reelsvideo",
];
const SEARCH_ORDERS = ["viewCount", "relevance", "date", "rating"];
const FANOUT_REGIONS = ["US", "GB", "CA", "AU", "IN", "DE", "BR", "JP", "KR", "MX"];

function youtubePhases(opts: YouTubeOpts): YtPhase[] {
  const region = opts.region;
  const query = opts.query?.trim();
  if (opts.shorts) {
    if (query) {
      return SEARCH_ORDERS.map((order) => ({ kind: "search" as const, q: `${query} #shorts`, order, region, short: true }));
    }
    // Distinct seeds first (least overlap), then extra sort passes on the base seed.
    return [
      ...SHORTS_SEEDS.map((q) => ({ kind: "search" as const, q, order: "viewCount", region, short: true })),
      { kind: "search" as const, q: "#shorts", order: "relevance", region, short: true },
      { kind: "search" as const, q: "#shorts", order: "date", region, short: true },
    ];
  }
  if (query) {
    return SEARCH_ORDERS.map((order) => ({ kind: "search" as const, q: query, order, region, short: false }));
  }
  // Default trending: the selected region's chart, then other regions for depth.
  const regions = [region, ...FANOUT_REGIONS.filter((r) => r !== region)];
  return regions.map((r) => ({ kind: "chart" as const, region: r }));
}

// Cursor packs "<phaseIndex>:<pageToken>". A raw legacy token (no colon) is
// treated as phase 0's token so in-flight cursors keep working.
function encodeYtCursor(phase: number, token?: string): string {
  return `${phase}:${token ?? ""}`;
}
function decodeYtCursor(token?: string): { phase: number; pageToken?: string } {
  if (!token) return { phase: 0 };
  const i = token.indexOf(":");
  if (i === -1) return { phase: 0, pageToken: token };
  const p = Number(token.slice(0, i));
  const t = token.slice(i + 1);
  return { phase: Number.isFinite(p) ? p : 0, pageToken: t || undefined };
}

async function fetchYouTubeChartPage(key: string, region: string, pageToken: string | undefined, opts: YouTubeOpts) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics,status");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", region);
  url.searchParams.set("maxResults", String(YOUTUBE_PAGE_SIZE));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  url.searchParams.set("key", key);
  const response = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!response.ok) throw new Error(`YouTube popular failed: ${response.status}`);
  const data = (await response.json()) as { items?: YouTubeVideoItem[]; nextPageToken?: string };
  return { cards: await buildYouTubeCards(data.items ?? [], key, { ...opts, shorts: false }), nextPageToken: data.nextPageToken };
}

async function fetchYouTubeSearchPage(key: string, phase: Extract<YtPhase, { kind: "search" }>, pageToken: string | undefined, opts: YouTubeOpts) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("order", phase.order);
  url.searchParams.set("maxResults", String(YOUTUBE_PAGE_SIZE));
  url.searchParams.set("q", phase.q);
  url.searchParams.set("regionCode", phase.region);
  if (phase.short) url.searchParams.set("videoDuration", "short");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  url.searchParams.set("key", key);
  const response = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!response.ok) throw new Error(`YouTube search failed: ${response.status}`);
  const data = (await response.json()) as { items?: YouTubeSearchItem[]; nextPageToken?: string };
  const ids = (data.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  return { cards: await fetchYouTubeVideos(ids, key, { ...opts, shorts: phase.short }), nextPageToken: data.nextPageToken };
}

// ponytail: search pages cost 100 quota units each (chart pages cost 1). Fan-out
// deepens the feed but multiplies search-query spend — cached 30 min per unique
// URL. If daily quota (10k) bites, cap phases or move to vendor data.
async function fetchYouTubeTrendCards(
  opts: YouTubeOpts,
): Promise<{ cards: TrendCard[]; nextPageToken?: string }> {
  const key = process.env.YOUTUBE_API_KEY ?? process.env.GOOGLE_YOUTUBE_API_KEY;
  if (!key) return { cards: [] };

  const phases = youtubePhases(opts);
  const { phase: phaseIndex, pageToken } = decodeYtCursor(opts.pageToken);
  const phase = phases[phaseIndex];
  if (!phase) return { cards: [] };

  const result =
    phase.kind === "chart"
      ? await fetchYouTubeChartPage(key, phase.region, pageToken, opts)
      : await fetchYouTubeSearchPage(key, phase, pageToken, opts);

  // Continue within this phase, else roll to the next phase, else stop.
  let nextCursor: string | undefined;
  if (result.nextPageToken) nextCursor = encodeYtCursor(phaseIndex, result.nextPageToken);
  else if (phaseIndex + 1 < phases.length) nextCursor = encodeYtCursor(phaseIndex + 1);

  return { cards: result.cards, nextPageToken: nextCursor };
}

function blueskyPostUrl(post: BlueskyPostView) {
  const handle = post.author?.handle;
  const rkey = post.uri?.split("/").pop();
  return handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : "https://bsky.app/search";
}

type TrendAspect = TrendCard["aspect"];
function aspectFromRatio(width?: number, height?: number): TrendAspect {
  if (!width || !height) return "wide";
  const ratio = width / height;
  if (ratio > 1.15) return "wide";
  if (ratio < 0.8) return "vertical";
  return "square";
}

function blueskyToTrendCard(post: BlueskyPostView, index: number): TrendCard | null {
  const text = cleanText(post.record?.text);
  if (!post.uri || !text) return null;
  const author = post.author?.handle ? `@${post.author.handle}` : "@bsky.app";
  const engagement = (post.likeCount ?? 0) + (post.replyCount ?? 0) + (post.repostCount ?? 0) + (post.quoteCount ?? 0);

  // Classify by attached media: video → format "video"; image → image card;
  // neither → a text-only post (no thumbnail, rendered as a text card).
  const embedType = post.embed?.$type ?? "";
  const image = post.embed?.images?.[0];
  let format: TrendCard["format"] = "source";
  let thumbnail: string | undefined;
  let aspect: TrendAspect = index % 3 === 0 ? "portrait" : "square";
  if (embedType.includes("video")) {
    format = "video";
    thumbnail = post.embed?.thumbnail;
    aspect = aspectFromRatio(post.embed?.aspectRatio?.width, post.embed?.aspectRatio?.height);
  } else if (image?.thumb) {
    thumbnail = image.thumb;
    aspect = aspectFromRatio(image.aspectRatio?.width, image.aspectRatio?.height);
  }

  return {
    id: `bluesky-${post.uri}`,
    platform: "bluesky",
    platformIconId: "bluesky",
    source: "Bluesky public API",
    title: text.slice(0, 64),
    creator: author,
    caption: text,
    category: "Bluesky",
    format,
    aspect,
    tags: ["conversation", "open-social", "public-api"],
    thumbnail,
    slides: 1,
    authorAvatar: post.author?.avatar,
    postedAt: compactDate(post.indexedAt ?? post.record?.createdAt),
    publishedAt: post.indexedAt ?? post.record?.createdAt,
    followers: post.author?.followersCount ? `${compactNumber(post.author.followersCount)} followers` : "Public post",
    sourceUrl: blueskyPostUrl(post),
    stats: {
      views: compactNumber(engagement),
      likes: compactNumber(post.likeCount),
      comments: compactNumber(post.replyCount),
      shares: compactNumber((post.repostCount ?? 0) + (post.quoteCount ?? 0)),
      saves: "—",
    },
  };
}

async function fetchBlueskyTrendCards(query?: string, cursor?: string) {
  const url = new URL(
    query
      ? "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"
      : "https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed",
  );
  if (query) {
    url.searchParams.set("q", query);
    url.searchParams.set("sort", "top");
  } else {
    url.searchParams.set("feed", BLUESKY_WHATS_HOT_FEED);
  }
  url.searchParams.set("limit", "40");
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await fetch(url, { next: { revalidate: 60 * 10 } });
  if (!response.ok) throw new Error(`Bluesky failed: ${response.status}`);
  const data = (await response.json()) as {
    posts?: BlueskyPostView[];
    feed?: { post?: BlueskyPostView }[];
    cursor?: string;
  };
  const posts = query
    ? data.posts ?? []
    : (data.feed ?? []).map((entry) => entry.post).filter((post): post is BlueskyPostView => Boolean(post));
  return {
    cards: posts.map((post, index) => blueskyToTrendCard(post, index)).filter((item): item is TrendCard => Boolean(item)),
    nextPageToken: data.cursor,
  };
}

function mastodonToTrendCard(status: MastodonStatus, index: number): TrendCard | null {
  const text = cleanText(status.content);
  if (!status.id || !text) return null;
  const creator = status.account?.acct ? `@${status.account.acct}` : "@mastodon";
  const engagement = (status.favourites_count ?? 0) + (status.replies_count ?? 0) + (status.reblogs_count ?? 0);

  const media = status.media_attachments ?? [];
  const video = media.find((m) => m.type === "video" || m.type === "gifv");
  const image = media.find((m) => m.type === "image");
  let format: TrendCard["format"] = "source";
  let thumbnail: string | undefined;
  let aspect: TrendAspect = index % 2 === 0 ? "portrait" : "square";
  if (video) {
    format = "video";
    thumbnail = video.preview_url ?? video.url;
    aspect = aspectFromRatio(video.meta?.original?.width, video.meta?.original?.height);
  } else if (image) {
    thumbnail = image.preview_url ?? image.url;
    aspect = aspectFromRatio(image.meta?.original?.width, image.meta?.original?.height);
  }

  return {
    id: `mastodon-${status.id}`,
    platform: "mastodon",
    platformIconId: "mastodon",
    source: "Mastodon public API",
    title: text.slice(0, 64),
    creator,
    caption: text,
    category: "Mastodon",
    format,
    aspect,
    tags: (status.tags ?? []).map((tag) => tag.name).filter((tag): tag is string => Boolean(tag)).slice(0, 4),
    thumbnail,
    slides: 1,
    authorAvatar: status.account?.avatar,
    postedAt: compactDate(status.created_at),
    publishedAt: status.created_at,
    followers: status.account?.followers_count ? `${compactNumber(status.account.followers_count)} followers` : "Public post",
    sourceUrl: status.url ?? "https://mastodon.social/explore",
    stats: {
      views: compactNumber(engagement),
      likes: compactNumber(status.favourites_count),
      comments: compactNumber(status.replies_count),
      shares: compactNumber(status.reblogs_count),
      saves: "—",
    },
  };
}

function mastodonNextCursorFromLink(linkHeader: string | null) {
  if (!linkHeader) return undefined;
  const nextLink = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'));
  const urlMatch = nextLink?.match(/<([^>]+)>/);
  if (!urlMatch) return undefined;

  try {
    return new URL(urlMatch[1]).searchParams.get("max_id") ?? undefined;
  } catch {
    return undefined;
  }
}

async function fetchMastodonTrendCards(query?: string, cursor?: string) {
  const url = query
    ? new URL(`https://mastodon.social/api/v1/timelines/tag/${encodeURIComponent(query.replace(/^#/, ""))}`)
    : new URL("https://mastodon.social/api/v1/trends/statuses");
  url.searchParams.set("limit", String(MASTODON_PAGE_SIZE));
  if (query && cursor) {
    url.searchParams.set("max_id", cursor);
  } else if (!query && cursor) {
    url.searchParams.set("offset", cursor);
  }

  const response = await fetch(url, { next: { revalidate: 60 * 10 } });
  if (!response.ok) throw new Error(`Mastodon failed: ${response.status}`);
  const data = (await response.json()) as MastodonStatus[];
  const nextPageToken = query
    ? mastodonNextCursorFromLink(response.headers.get("link"))
    : data.length >= MASTODON_PAGE_SIZE
      ? String((Number(cursor) || 0) + MASTODON_PAGE_SIZE)
      : undefined;
  return {
    cards: data.map((status, index) => mastodonToTrendCard(status, index)).filter((item): item is TrendCard => Boolean(item)),
    nextPageToken,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  // `cursor` is the YouTube pageToken from a prior response. When present this is a
  // "load more" request: only YouTube paginates, so we skip the non-paginating
  // platforms to avoid re-returning their (already-shown) first page as duplicates.
  const cursor = searchParams.get("cursor") ?? undefined;
  const requestedSources = searchParams
    .get("platforms")
    ?.split(",")
    .map((source) => source.trim())
    .filter((source): source is ApiSource => (API_SOURCES as readonly string[]).includes(source));
  const sources = requestedSources?.length ? requestedSources : DEFAULT_SOURCES;
  // Keep the existing YouTube cursor behavior intact; when a user selects only
  // Bluesky/Mastodon, use that source's cursor so the grid can load the next 40
  // public posts without changing the existing YouTube cursor behavior.
  const cursorSource: ApiSource = sources.includes("youtube-shorts")
    ? "youtube-shorts"
    : sources.includes("youtube")
      ? "youtube"
      : sources.includes("bluesky")
        ? "bluesky"
        : sources.includes("mastodon")
          ? "mastodon"
        : sources[0];
  const activeSources = cursor ? sources.filter((source) => source === cursorSource) : sources;

  // YouTube-specific config (region, hide-kids). Other platforms ignore these.
  const region = (searchParams.get("region") || "US").toUpperCase().slice(0, 2);
  const hideKids = searchParams.get("hideKids") === "1";

  const tasks = activeSources.map(
    async (source): Promise<{ cards: TrendCard[]; nextPageToken?: string }> => {
      if (source === "youtube")
        return fetchYouTubeTrendCards({ query, pageToken: cursor, shorts: false, region, hideKids });
      if (source === "youtube-shorts")
        return fetchYouTubeTrendCards({ query, pageToken: cursor, shorts: true, region, hideKids });
      if (source === "bluesky") return fetchBlueskyTrendCards(query, cursor);
      return fetchMastodonTrendCards(query, cursor);
    },
  );

  const settled = await Promise.allSettled(tasks);
  // Interleave sources round-robin (yt, bluesky, mastodon, yt, …) so an all-sources
  // feed is genuinely mixed instead of grouped by platform. Load-more requests carry
  // a single source, so this is a no-op there.
  const cardArrays = settled.map((result) => (result.status === "fulfilled" ? result.value.cards : []));
  const items: TrendCard[] = [];
  const longest = cardArrays.reduce((max, arr) => Math.max(max, arr.length), 0);
  for (let i = 0; i < longest; i++) {
    for (const arr of cardArrays) {
      if (i < arr.length) items.push(arr[i]);
    }
  }
  const cursorIndex = activeSources.indexOf(cursorSource);
  const cursorResult = cursorIndex >= 0 ? settled[cursorIndex] : undefined;
  const nextCursor =
    cursorResult?.status === "fulfilled" ? cursorResult.value.nextPageToken ?? null : null;
  const errors = settled
    .map((result, index) =>
      result.status === "rejected"
        ? {
            platform: activeSources[index] === "youtube-shorts" ? "youtube" : activeSources[index],
            reason: result.reason instanceof Error ? result.reason.message : "api_error",
          }
        : null,
    )
    .filter(Boolean);

  return NextResponse.json({
    items,
    nextCursor,
    source: "free_platform_apis",
    errors,
    note:
      "YouTube requires YOUTUBE_API_KEY/GOOGLE_YOUTUBE_API_KEY. Bluesky and Mastodon use public endpoints. Other platform chips open compliant free source surfaces.",
  });
}
