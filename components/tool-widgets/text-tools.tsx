"use client";

import { useMemo, useState } from "react";
import { CopyField } from "../interactive";
import { Icon } from "../icons";

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

export function LinkedInFormatter() {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="input h-28"
        placeholder="Type your LinkedIn post text..."
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
            Heads-up: unicode styling is not read by screen readers. Use sparingly.
          </p>
        </>
      )}
    </div>
  );
}

export function TiktokCaptionGenerator() {
  const [topic, setTopic] = useState("");
  const [seed, setSeed] = useState(0);
  const hooks = [
    "POV: you finally figured out {t}",
    "Nobody talks about this side of {t}",
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
    return hooks
      .slice(seed % 4, (seed % 4) + 4)
      .map((h) => `${h.replaceAll("{t}", topic.trim())} #${tag} #fyp #creator`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, seed]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Your video topic, e.g. meal prep"
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

export function YoutubeTitleChecker() {
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
        placeholder="Paste your video title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <p className="mt-1 text-right text-xs text-muted">{title.length}/100</p>
      <ul className="mt-3 flex flex-col gap-2">
        {checks.map((c) => (
          <li
            key={c.label}
            className={`flex items-center gap-2 text-sm ${
              title ? (c.ok ? "text-primary-deep" : "text-danger") : "text-muted"
            }`}
          >
            <Icon name={c.ok && title ? "check" : "x"} size={14} /> {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function YoutubeTagGenerator() {
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
        placeholder="Video topic, e.g. sourdough baking"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      {tags && <CopyField value={tags} />}
      {tags && <p className="text-xs text-muted">{tags.length}/500 characters (YouTube's tag budget)</p>}
    </div>
  );
}

const X_BLOCK_CSS = `/* X (Twitter) timeline blocker - paste into a userstyle
   extension (Stylus) or your browser's custom CSS */
[data-testid="primaryColumn"] section > div > div > div:has([data-testid="tweet"]) {
  display: none !important;
}
[aria-label="Timeline: Trending now"],
[data-testid="sidebarColumn"] {
  display: none !important;
}`;

export function XTimelineBlocker() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Post without getting pulled into the feed. Add this CSS with a userstyle extension scoped to{" "}
        <code className="rounded bg-page px-1">x.com</code>. Your timeline and trends disappear,
        but composing and notifications still work.
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

export function HashtagCounter() {
  const [text, setText] = useState("");
  const hashtags = (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;

  return (
    <div>
      <textarea
        className="input h-28"
        placeholder="Paste your caption..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="mt-2 text-sm font-semibold">
        {text.length} characters - {hashtags} hashtag{hashtags === 1 ? "" : "s"}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
        {LIMITS.map(([name, max]) => (
          <li
            key={name}
            className={`flex justify-between rounded-lg px-2.5 py-1.5 ${
              text.length > max ? "bg-red-50 text-red-700" : "bg-page text-muted"
            }`}
          >
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
