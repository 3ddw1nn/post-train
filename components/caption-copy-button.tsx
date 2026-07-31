"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

/** A consistent copy control for generated and hand-written platform captions. */
export function CaptionCopyButton({ value, compact = false }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyCaption() {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access can be unavailable in an embedded or non-secure
      // browser context. The button remains safely usable without changing
      // the caption or blocking the rest of the editor.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copyCaption()}
      disabled={!value.trim()}
      className={`btn-subtle ${compact ? "!py-1 text-xs" : "!py-1.5 text-xs"} disabled:opacity-50`}
      aria-label={copied ? "Caption copied" : "Copy caption"}
    >
      <Icon name={copied ? "check" : "copy"} size={compact ? 12 : 13} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
