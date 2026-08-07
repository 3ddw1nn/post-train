"use client";

// One platform's caption box: the textarea, its character budget, and the
// Copy / AI Auto-fill / Check Tone / "Make it sound less AI" controls.
//
// Extracted from the Composer so the Batch Scheduler gets the same behaviour
// instead of a second copy — the AI call, the tone heuristic and the improve
// pass are all non-trivial enough that two implementations would drift.
// Each instance owns its own busy/error/tone state, keyed to one platform.

import { useState } from "react";
import { Icon } from "./icons";
import { PlatformIcon } from "./platform-icon";
import { CaptionCopyButton } from "./caption-copy-button";
import { checkAiTone, type AiToneResult } from "@/lib/ai-tone";
import { platform as platformOf, CAPTION_MAX, CAPTION_MAX_BY_PLATFORM } from "@/lib/platforms";

/** The platform's own hard cap, falling back to the generic one. */
export function captionMaxFor(platformId: string): number {
  return CAPTION_MAX_BY_PLATFORM[platformId as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? CAPTION_MAX;
}

export function CaptionEditor({
  platformId,
  value,
  onChange,
  brief,
  length,
  format,
  campaignName = "",
  disabled = false,
  showLabel = true,
  required = false,
  rows = "h-24",
  /** Rendered between the caption box and the button row — the Batch
   *  Scheduler puts its aspect-ratio warning here. */
  notice,
}: {
  platformId: string;
  value: string;
  onChange: (next: string) => void;
  /** The AI caption brief — Auto-fill is disabled without one. */
  brief: string;
  length: "short" | "medium" | "long";
  format: "video" | "post" | "slideshow";
  campaignName?: string;
  disabled?: boolean;
  showLabel?: boolean;
  required?: boolean;
  rows?: string;
  notice?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tone, setTone] = useState<AiToneResult | null>(null);
  const [improving, setImproving] = useState(false);

  const max = captionMaxFor(platformId);
  const name = platformOf(platformId)?.name ?? platformId;
  const over = value.length >= max;

  function update(next: string) {
    onChange(next);
    setTone(null); // a stale verdict on edited text is worse than none
  }

  async function autoFill() {
    if (busy || !brief.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/app/studio/platform-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId, context: brief, campaignName, length, format }),
      });
      const data = (await response.json()) as { text?: string; error?: { message?: string } };
      if (!response.ok || !data.text) throw new Error(data.error?.message ?? "Couldn't generate a caption.");
      update(data.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't generate a caption.");
    } finally {
      setBusy(false);
    }
  }

  async function improve() {
    if (!value.trim() || improving) return;
    setImproving(true);
    try {
      const response = await fetch("/api/app/studio/improve-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId, text: value, flagged: tone?.matches ?? [] }),
      });
      const data = (await response.json()) as { text?: string };
      if (response.ok && data.text) {
        onChange(data.text);
        setTone(checkAiTone(data.text));
      }
    } finally {
      setImproving(false);
    }
  }

  return (
    <div>
      {showLabel && (
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`caption-${platformId}`} className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <PlatformIcon id={platformId} size={15} /> {name}
            {required && (
              <span className="text-danger" aria-hidden="true">
                *
              </span>
            )}
          </label>
          <span className={`text-xs font-semibold ${over ? "text-danger" : "text-muted"}`}>
            {value.length}/{max}
          </span>
        </div>
      )}
      <div className="mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <textarea
          id={`caption-${platformId}`}
          className={`${rows} w-full resize-y border-0 bg-white px-3 py-2.5 text-sm leading-5 text-ink outline-none placeholder:text-muted`}
          maxLength={max}
          value={value}
          onChange={(event) => update(event.target.value)}
          placeholder={`Caption for ${name}…`}
          disabled={disabled}
        />
        {!showLabel && (
          <div className="flex justify-end px-3 pb-1">
            <span className={`text-[10px] font-semibold ${over ? "text-danger" : "text-muted"}`}>
              {value.length}/{max}
            </span>
          </div>
        )}
        {notice}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <CaptionCopyButton value={value} />
          <button
            type="button"
            onClick={() => void autoFill()}
            disabled={disabled || busy || !brief.trim()}
            title={!brief.trim() ? "Add an AI caption brief first" : undefined}
            className="btn-subtle !py-1.5 text-xs disabled:opacity-50"
          >
            {busy ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
            ) : (
              <Icon name="sparkles" size={13} />
            )}
            {busy ? "Writing…" : "AI Auto-fill"}
          </button>
          <button
            type="button"
            onClick={() => value.trim() && setTone(checkAiTone(value))}
            disabled={disabled || !value.trim()}
            className="btn-subtle !py-1.5 text-xs disabled:opacity-50"
          >
            <Icon name="search" size={13} /> Check Tone
          </button>
          {tone && tone.level !== "natural" && (
            <button
              type="button"
              onClick={() => void improve()}
              disabled={disabled || improving}
              className="btn-subtle !py-1.5 text-xs disabled:opacity-50"
            >
              {improving ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
              ) : (
                <Icon name="sparkles" size={13} />
              )}
              {improving ? "Improving…" : "Make it sound less AI"}
            </button>
          )}
        </div>
        {tone && (
          <div className="border-t border-line bg-page/50 px-3 py-2">
            <p
              className={`text-xs font-bold ${
                tone.level === "high" ? "text-danger" : tone.level === "some" ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {tone.level === "high"
                ? "Sounds very AI-generated"
                : tone.level === "some"
                  ? "A little AI-ish"
                  : "Sounds natural"}
            </p>
            {tone.matches.length > 0 && (
              <p className="mt-0.5 text-xs text-muted">Flagged: &ldquo;{tone.matches.join("”, “")}&rdquo;</p>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
      {required && !value.trim() && (
        <p className="mt-1 text-xs font-semibold text-danger" role="alert">
          A caption is required for {name}.
        </p>
      )}
    </div>
  );
}

/** The shared "AI caption brief" block: the prompt every Auto-fill reads from,
 *  plus the Short / Medium / Long target. */
export function CaptionBrief({
  value,
  onChange,
  length,
  onLengthChange,
  disabled = false,
  hint = "This prompt is used by AI Auto-fill to write a tailored caption for each selected platform.",
  onPaste,
}: {
  value: string;
  onChange: (next: string) => void;
  length: "short" | "medium" | "long";
  onLengthChange: (next: "short" | "medium" | "long") => void;
  disabled?: boolean;
  hint?: string;
  /** The Composer doubles this field as a paste target for media files. */
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor="caption-brief" className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
          AI caption brief
        </label>
        <div className="flex items-center gap-1 rounded-lg bg-page p-0.5" aria-label="AI caption length">
          {(
            [
              ["short", "Short"],
              ["medium", "Medium"],
              ["long", "Long"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={length === id}
              onClick={() => onLengthChange(id)}
              disabled={disabled}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                length === id ? "bg-white text-primary-deep shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-2">
        <textarea
          id="caption-brief"
          className="input h-24 resize-y pr-16"
          placeholder="Describe the post, audience, tone, and key message…"
          value={value}
          maxLength={CAPTION_MAX}
          onChange={(event) => onChange(event.target.value)}
          onPaste={onPaste}
          disabled={disabled}
        />
        <span className="pointer-events-none absolute bottom-2 right-3 text-xs font-semibold text-muted">
          {value.length}/{CAPTION_MAX}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{hint}</p>
    </div>
  );
}
