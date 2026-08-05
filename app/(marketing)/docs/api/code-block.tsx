"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Copy state lives here rather than in a shared toast: the confirmation belongs
 * next to the thing you clicked, and a docs page has a dozen of these.
 *
 * Colors note: the previous docs code blocks used brand teal (#0e8177) on
 * near-black, which measures 3.7:1 — under the 4.5:1 floor for body-sized text.
 * Code is read character by character, so it's the last place to accept a near
 * miss. Base text is now a near-white and teal survives only as a label accent
 * where it sits on a light surface.
 */
export function CodeBlock({
  code,
  lang,
  label,
}: {
  code: string;
  lang?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked (insecure origin, denied permission) — leave the button idle */
    }
  }

  return (
    <figure className="mt-4 overflow-hidden rounded-lg border border-line">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-page/70 py-1.5 pl-3 pr-1.5">
        <span className="truncate text-[11px] font-semibold text-muted">
          {label ?? lang ?? "Example"}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied to clipboard" : "Copy code"}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        >
          <Icon name={copied ? "check" : "copy"} size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto bg-[#15181a] p-4 text-[12.5px] leading-relaxed text-[#e4ecea]">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
