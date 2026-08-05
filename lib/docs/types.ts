// Shared document model behind every long-form page (API reference, growth
// playbook). Content is authored as data so each page renders to both HTML and
// Markdown from one source — see lib/docs/api-reference.ts for the reasoning.

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type DocBlock =
  | { kind: "prose"; text: string }
  | { kind: "code"; lang: string; label?: string; code: string }
  | { kind: "note"; tone: "info" | "warn"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  /** A link into the product — turns advice into something you can act on. */
  | { kind: "action"; label: string; href: string; desc?: string }
  /** Ordered move-by-move sequence. Numbering is the content, not decoration. */
  | { kind: "steps"; items: { title: string; body: string }[] }
  | {
      kind: "endpoint";
      method: Method;
      path: string;
      summary: string;
      params?: { name: string; type: string; required?: boolean; desc: string }[];
      request?: string;
      response?: string;
    };

export type DocSection = { id: string; title: string; blocks: DocBlock[] };
export type DocGroup = { id: string; title: string; sections: DocSection[] };

// ── Markdown rendering ──────────────────────────────────────────────────────

function endpointMarkdown(b: Extract<DocBlock, { kind: "endpoint" }>): string {
  const out = [`#### \`${b.method} ${b.path}\``, "", b.summary];
  if (b.params?.length) {
    out.push("", "| Parameter | Type | Required | Description |", "| --- | --- | --- | --- |");
    for (const p of b.params) {
      out.push(`| \`${p.name}\` | ${p.type} | ${p.required ? "yes" : "no"} | ${p.desc} |`);
    }
  }
  if (b.request) out.push("", "Request:", "", "```json", b.request, "```");
  if (b.response) out.push("", "Response:", "", "```json", b.response, "```");
  return out.join("\n");
}

export function blockMarkdown(b: DocBlock): string {
  switch (b.kind) {
    case "prose":
      return b.text;
    case "code":
      return [b.label ? `${b.label}:` : null, "", "```" + b.lang, b.code, "```"]
        .filter((l) => l !== null)
        .join("\n");
    case "note":
      return `> **${b.tone === "warn" ? "Important" : "Note"}:** ${b.text}`;
    case "table":
      return [
        `| ${b.headers.join(" | ")} |`,
        `| ${b.headers.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n");
    case "action":
      return `→ [${b.label}](https://posttrain.app${b.href})${b.desc ? ` — ${b.desc}` : ""}`;
    case "steps":
      return b.items.map((s, i) => `${i + 1}. **${s.title}** — ${s.body}`).join("\n");
    case "endpoint":
      return endpointMarkdown(b);
  }
}

export function toMarkdown(groups: DocGroup[], title: string, preamble: string[]): string {
  const out = [`# ${title}`, "", ...preamble];
  for (const group of groups) {
    out.push("", `## ${group.title}`);
    for (const section of group.sections) {
      out.push("", `### ${section.title}`, "");
      out.push(section.blocks.map(blockMarkdown).join("\n\n"));
    }
  }
  return out.join("\n") + "\n";
}
