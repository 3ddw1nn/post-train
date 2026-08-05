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

export function sectionMarkdown(group: DocGroup, section: DocSection): string {
  return [`# ${section.title}`, "", `_${group.title}_`, "", section.blocks.map(blockMarkdown).join("\n\n")].join(
    "\n"
  );
}

// ── One-page-per-section navigation ─────────────────────────────────────────
// Shared by the docs router and the growth playbook: every long-form doc is
// now a sequence of pages, not one scrolling page, so both need the same
// "what comes before/after this section" arithmetic.

export type FlatSection = {
  id: string;
  title: string;
  groupId: string;
  groupTitle: string;
  /** Position in the flattened sequence — 0 is the doc's landing page. */
  index: number;
};

export function flattenSections(groups: DocGroup[]): FlatSection[] {
  const out: FlatSection[] = [];
  let index = 0;
  for (const group of groups) {
    for (const section of group.sections) {
      out.push({ id: section.id, title: section.title, groupId: group.id, groupTitle: group.title, index: index++ });
    }
  }
  return out;
}

/**
 * The first section in a doc lives at the bare base path (`/docs/api`), not
 * `/docs/api/introduction` — a docs home that's really "section 1 of 15" in
 * disguise is confusing to link to and to read in a URL bar. Every other
 * section gets `${basePath}/${id}`.
 */
export function sectionHref(basePath: string, id: string, firstId: string): string {
  return id === firstId ? basePath : `${basePath}/${id}`;
}

export function findGroupAndSection(
  groups: DocGroup[],
  id: string
): { group: DocGroup; section: DocSection } | null {
  for (const group of groups) {
    const section = group.sections.find((s) => s.id === id);
    if (section) return { group, section };
  }
  return null;
}
