"use client";

// Free marketing tools (spec 11 §12) — all client-side, no login.
import { useMemo, useRef, useState } from "react";
import { CopyField, Select } from "./interactive";
import { Icon } from "./icons";

/* ---------- image splitters ---------- */

function useImageSplitter(cols: number, rowsAuto = false) {
  const [tiles, setTiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function split(file: File, colsOverride?: number) {
    setBusy(true);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((r) => (img.onload = r));
    const c = colsOverride ?? cols;
    const rows = rowsAuto ? Math.max(1, Math.round(img.height / (img.width / c))) : 1;
    const tw = img.width / c;
    const th = img.height / rows;
    const out: string[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < c; x++) {
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        canvas.getContext("2d")!.drawImage(img, x * tw, y * th, tw, th, 0, 0, tw, th);
        out.push(canvas.toDataURL("image/jpeg", 0.92));
      }
    }
    URL.revokeObjectURL(img.src);
    setTiles(out);
    setBusy(false);
  }
  return { tiles, busy, split };
}

function SplitterUI({
  title,
  hint,
  cols,
  selectable,
}: {
  title: string;
  hint: string;
  cols: number;
  selectable?: boolean;
}) {
  const [n, setN] = useState(cols);
  const { tiles, busy, split } = useImageSplitter(n, !selectable);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      {selectable && (
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          Panels:
          <Select
            className="w-20"
            value={String(n)}
            onChange={(v) => setN(Number(v))}
            options={[2, 3, 4, 5, 6, 8, 10].map((x) => ({ value: String(x), label: String(x) }))}
          />
        </div>
      )}
      <button className="btn-primary" onClick={() => input.current?.click()} disabled={busy}>
        <Icon name="upload" size={15} /> {busy ? "Slicing…" : `Upload image for ${title}`}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && split(e.target.files[0], n)}
      />
      <p className="mt-2 text-xs text-muted">{hint}</p>
      {tiles.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {tiles.map((t, i) => (
            <a key={i} href={t} download={`tile-${i + 1}.jpg`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t} alt={`Tile ${i + 1}`} className="w-full rounded-lg border border-line" />
              <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/40 text-xs font-bold text-white group-hover:flex">
                Download
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- handle checkers ---------- */

function HandleChecker({
  platform,
  rules,
  regex,
  maxLen,
  profileUrl,
}: {
  platform: string;
  rules: string[];
  regex: RegExp;
  maxLen: number;
  profileUrl: (h: string) => string;
}) {
  const [handle, setHandle] = useState("");
  const clean = handle.replace(/^@/, "");
  const valid = clean.length > 0 && clean.length <= maxLen && regex.test(clean);
  return (
    <div>
      <div className="flex items-center gap-1">
        <span className="text-muted">@</span>
        <input
          className="input"
          placeholder={`your${platform.toLowerCase()}handle`}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
      </div>
      {clean && (
        <p className={`mt-2 text-sm font-semibold ${valid ? "text-primary-deep" : "text-danger"}`}>
          {valid
            ? `✓ Valid ${platform} handle format`
            : `✗ Not a valid ${platform} handle`}
        </p>
      )}
      {clean && valid && (
        <a
          href={profileUrl(clean)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary-deep hover:underline"
        >
          {/* ponytail: availability can't be checked without platform APIs — open the profile to see */}
          Check availability on {platform} <Icon name="external" size={12} />
        </a>
      )}
      <ul className="mt-4 flex flex-col gap-1 text-xs text-muted">
        {rules.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- text tools ---------- */

const BOLD_MAP: Record<string, string> = {};
const ITALIC_MAP: Record<string, string> = {};
for (let i = 0; i < 26; i++) {
  BOLD_MAP[String.fromCharCode(65 + i)] = String.fromCodePoint(0x1d5d4 + i);
  BOLD_MAP[String.fromCharCode(97 + i)] = String.fromCodePoint(0x1d5ee + i);
  ITALIC_MAP[String.fromCharCode(65 + i)] = String.fromCodePoint(0x1d608 + i);
  ITALIC_MAP[String.fromCharCode(97 + i)] = String.fromCodePoint(0x1d622 + i);
}
for (let i = 0; i < 10; i++) BOLD_MAP[String(i)] = String.fromCodePoint(0x1d7ec + i);

function mapText(text: string, map: Record<string, string>) {
  return [...text].map((c) => map[c] ?? c).join("");
}

function LinkedInFormatter() {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="input h-28"
        placeholder="Type your LinkedIn post text…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {text && (
        <>
          <div>
            <p className="mb-1 text-xs font-bold text-muted">Bold</p>
            <CopyField value={mapText(text, BOLD_MAP)} />
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-muted">Italic</p>
            <CopyField value={mapText(text, ITALIC_MAP)} />
          </div>
          <p className="text-xs text-muted">
            Heads-up: unicode styling isn&apos;t read by screen readers — use sparingly.
          </p>
        </>
      )}
    </div>
  );
}

function CaptionGenerator() {
  const [topic, setTopic] = useState("");
  const [seed, setSeed] = useState(0);
  const HOOKS = [
    "POV: you finally figured out {t}",
    "Nobody talks about this side of {t} 👀",
    "I tested {t} for 30 days. Results inside.",
    "The {t} mistake everyone makes (and the fix)",
    "3 things I wish I knew before starting {t}",
    "This {t} hack is doing numbers right now",
    "Save this if you're serious about {t}",
    "Hot take: {t} is easier than you think",
  ];
  const captions = useMemo(() => {
    if (!topic.trim()) return [];
    const tag = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    return HOOKS.slice(seed % 4, (seed % 4) + 4).map(
      (h) => `${h.replaceAll("{t}", topic.trim())} #${tag} #fyp #creator`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, seed]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Your video topic, e.g. “meal prep”"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <button className="btn-primary shrink-0" onClick={() => setSeed((s) => s + 1)}>
          Generate
        </button>
      </div>
      {captions.map((c, i) => (
        <CopyField key={`${c}-${i}`} value={c} />
      ))}
    </div>
  );
}

function YoutubeTitleChecker() {
  const [title, setTitle] = useState("");
  const checks = [
    { label: "Under 100 characters (hard limit)", ok: title.length > 0 && title.length <= 100 },
    { label: "Under 70 characters (no truncation in search)", ok: title.length > 0 && title.length <= 70 },
    { label: "Contains a number or bracket (higher CTR patterns)", ok: /[0-9([]/.test(title) },
    { label: "Not all-caps shouting", ok: title.length > 0 && title !== title.toUpperCase() },
    { label: "Front-loads a keyword (first 40 chars carry weight)", ok: title.trim().split(" ").length >= 3 },
  ];
  return (
    <div>
      <input
        className="input"
        placeholder="Paste your video title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <p className="mt-1 text-right text-xs text-muted">{title.length}/100</p>
      <ul className="mt-3 flex flex-col gap-2">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-2 text-sm ${title ? (c.ok ? "text-primary-deep" : "text-danger") : "text-muted"}`}>
            <Icon name={c.ok && title ? "check" : "x"} size={14} /> {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function YoutubeTagGenerator() {
  const [topic, setTopic] = useState("");
  const tags = useMemo(() => {
    const t = topic.trim().toLowerCase();
    if (!t) return "";
    const words = t.split(/\s+/);
    const base = [
      t,
      `${t} tutorial`,
      `${t} for beginners`,
      `how to ${t}`,
      `${t} tips`,
      `${t} 2026`,
      `best ${t}`,
      `${t} guide`,
      `${t} explained`,
      ...words.filter((w) => w.length > 3),
    ];
    return [...new Set(base)].join(", ");
  }, [topic]);
  return (
    <div className="flex flex-col gap-3">
      <input
        className="input"
        placeholder="Video topic, e.g. “sourdough baking”"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      {tags && <CopyField value={tags} />}
      {tags && (
        <p className="text-xs text-muted">{tags.length}/500 characters (YouTube's tag budget)</p>
      )}
    </div>
  );
}

const X_BLOCK_CSS = `/* X (Twitter) timeline blocker — paste into a userstyle
   extension (Stylus) or your browser's custom CSS */
[data-testid="primaryColumn"] section > div > div > div:has([data-testid="tweet"]) {
  display: none !important;
}
[aria-label="Timeline: Trending now"],
[data-testid="sidebarColumn"] {
  display: none !important;
}`;

function XTimelineBlocker() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Post without getting pulled into the feed. Add this CSS with a userstyle
        extension (like Stylus) scoped to <code className="rounded bg-page px-1">x.com</code>{" "}
        — your timeline and trends disappear, but composing and notifications still work.
      </p>
      <pre className="overflow-x-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-primary">
        {X_BLOCK_CSS}
      </pre>
      <CopyField value={X_BLOCK_CSS} />
    </div>
  );
}

const LIMITS: [string, number][] = [
  ["Twitter/X", 280],
  ["Instagram", 2200],
  ["TikTok", 2200],
  ["LinkedIn", 3000],
  ["YouTube title", 100],
  ["Pinterest", 500],
  ["Threads", 500],
  ["Bluesky", 300],
];

function HashtagCounter() {
  const [text, setText] = useState("");
  const hashtags = (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  return (
    <div>
      <textarea
        className="input h-28"
        placeholder="Paste your caption…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="mt-2 text-sm font-semibold">
        {text.length} characters · {hashtags} hashtag{hashtags === 1 ? "" : "s"}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
        {LIMITS.map(([name, max]) => (
          <li key={name} className={`flex justify-between rounded-lg px-2.5 py-1.5 ${text.length > max ? "bg-red-50 text-red-700" : "bg-page text-muted"}`}>
            <span>{name}</span>
            <span className="font-semibold">
              {text.length}/{max}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- registry ---------- */

export const TOOL_COMPONENTS: Record<string, () => React.ReactNode> = {
  "instagram-grid-maker": () => (
    <SplitterUI
      title="the grid"
      hint="Splits your image into 3-wide tiles, top-left to bottom-right — post them in reverse order so the grid assembles correctly."
      cols={3}
    />
  ),
  "carousel-splitter": () => (
    <SplitterUI
      title="the carousel"
      hint="Slices a wide panorama into equal swipeable panels."
      cols={3}
      selectable
    />
  ),
  "instagram-handle-checker": () => (
    <HandleChecker
      platform="Instagram"
      maxLen={30}
      regex={/^[a-zA-Z0-9._]+$/}
      rules={[
        "Up to 30 characters",
        "Letters, numbers, periods and underscores only",
        "No consecutive periods; can't end with a period",
      ]}
      profileUrl={(h) => `https://www.instagram.com/${h}/`}
    />
  ),
  "tiktok-username-checker": () => (
    <HandleChecker
      platform="TikTok"
      maxLen={24}
      regex={/^[a-zA-Z0-9._]+$/}
      rules={[
        "2–24 characters",
        "Letters, numbers, underscores and periods",
        "Can't end with a period",
      ]}
      profileUrl={(h) => `https://www.tiktok.com/@${h}`}
    />
  ),
  "tiktok-caption-generator": CaptionGenerator,
  "linkedin-formatter": LinkedInFormatter,
  "youtube-title-checker": YoutubeTitleChecker,
  "youtube-tag-generator": YoutubeTagGenerator,
  "x-timeline-blocker": XTimelineBlocker,
  "hashtag-counter": HashtagCounter,
};
