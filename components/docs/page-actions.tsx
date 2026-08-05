"use client";

import { useState } from "react";
import { Dropdown } from "@/components/interactive";
import { Icon } from "@/components/icons";
import { MCP_URL } from "@/lib/docs/api-reference";

const CLAUDE_CODE_CMD = `claude mcp add --transport http posttrain ${MCP_URL}`;

/**
 * One-click install links. Both editors take the server config in the URL —
 * VS Code percent-encoded, Cursor base64. Cursor's encoding is done on the
 * server and passed in as a prop: doing it here would need `btoa`, which
 * doesn't exist during SSR, and the resulting server/client mismatch is a
 * hydration error rather than a merely wrong link.
 */
const VSCODE_LINK = `vscode:mcp/install?${encodeURIComponent(
  JSON.stringify({ name: "posttrain", type: "http", url: MCP_URL })
)}`;

function MenuItem({
  icon,
  title,
  desc,
  onClick,
  href,
}: {
  icon: string;
  title: string;
  desc: string;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <Icon name={icon} size={15} className="mt-0.5 shrink-0 text-muted" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[13px] font-semibold text-ink">
          {title}
          {href && <Icon name="external" size={11} className="text-muted" />}
        </span>
        <span className="block text-[11.5px] leading-snug text-muted">{desc}</span>
      </span>
    </>
  );
  const cls =
    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-page focus-visible:bg-page focus-visible:outline-none";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/**
 * The "Copy page" affordance from modern docs sites: hand the whole page to a
 * model, or wire the MCP server into a client, without leaving the page.
 *
 * `markdown` is passed in from the server so the clipboard payload is generated
 * from the same content module that rendered the page — never a hand-kept twin.
 */
export function PageActions({
  markdown,
  markdownHref,
  cursorConfig,
}: {
  markdown: string;
  /** Path to this page's Markdown twin, e.g. /docs/api.md */
  markdownHref: string;
  /**
   * base64 of the Cursor MCP config, encoded server-side. Omitted on pages
   * where wiring up an MCP client isn't the point — a growth playbook offering
   * "Connect to Cursor" is menu noise, not a feature.
   */
  cursorConfig?: string;
}) {
  const aiPrompt = `Read https://posttrain.app${markdownHref} — Post Train documentation. Help me use it.`;
  const [flash, setFlash] = useState<string | null>(null);

  async function copy(text: string, confirmation: string) {
    try {
      await navigator.clipboard.writeText(text);
      // The menu closes on click, so confirmation lands on the trigger instead.
      setFlash(confirmation);
      setTimeout(() => setFlash(null), 1800);
    } catch {
      setFlash("Copy blocked");
      setTimeout(() => setFlash(null), 1800);
    }
  }

  return (
    <Dropdown
      align="right"
      width={288}
      menuClassName="border-line bg-white shadow-xl"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        >
          <Icon name={flash ? "check" : "copy"} size={14} className={flash ? "text-primary" : ""} />
          <span aria-live="polite">{flash ?? "Copy page"}</span>
          <Icon name="chevronDown" size={13} className="text-muted" />
        </button>
      }
    >
      <MenuItem
        icon="copy"
        title="Copy page"
        desc="Copy this page as Markdown for LLMs"
        onClick={() => copy(markdown, "Copied")}
      />
      <MenuItem
        icon="file"
        title="View as Markdown"
        desc="Open this page as plain text"
        href={markdownHref}
      />

      <div className="my-1 h-px bg-line" />

      <MenuItem
        icon="chat"
        title="Open in ChatGPT"
        desc="Ask ChatGPT about this page"
        href={`https://chatgpt.com/?hints=search&q=${encodeURIComponent(aiPrompt)}`}
      />
      <MenuItem
        icon="sparkles"
        title="Open in Claude"
        desc="Ask Claude about this page"
        href={`https://claude.ai/new?q=${encodeURIComponent(aiPrompt)}`}
      />

      {cursorConfig && (
        <>
      <div className="my-1 h-px bg-line" />

      <MenuItem
        icon="link"
        title="Connect with MCP"
        desc="Copy the server URL for any client"
        onClick={() => copy(MCP_URL, "URL copied")}
      />
      <MenuItem
        icon="sparkles"
        title="Connect to Claude Code"
        desc="Copy the claude mcp add command"
        onClick={() => copy(CLAUDE_CODE_CMD, "Command copied")}
      />
      <MenuItem
        icon="cube"
        title="Connect to VS Code"
        desc="Install this MCP in VS Code"
        href={VSCODE_LINK}
      />
      <MenuItem
        icon="grid"
        title="Connect to Cursor"
        desc="Install this MCP in Cursor"
        href={`cursor://anysphere.cursor-deeplink/mcp/install?name=posttrain&config=${cursorConfig}`}
      />
        </>
      )}
    </Dropdown>
  );
}
