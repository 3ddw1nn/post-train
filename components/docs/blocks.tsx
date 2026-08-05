import { Fragment, type ReactNode } from "react";
import type { DocBlock, Method } from "@/lib/docs/types";
import { CodeBlock } from "./code-block";

/**
 * Inline renderer for the `code` / **bold** / [link](url) subset the content
 * module allows. Deliberately not a Markdown library: the input is authored by
 * us at build time, so a 20-line splitter beats shipping a parser to render
 * three constructs.
 */
function inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          className="rounded border border-line bg-page px-1.5 py-0.5 font-mono text-[0.85em] text-primary-deep"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const external = link[2].startsWith("http");
      return (
        <a
          key={i}
          href={link[2]}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="font-medium text-primary-deep underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        >
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Method colors are load-bearing here — they encode destructiveness at a glance. */
const METHOD_TONE: Record<Method, string> = {
  GET: "bg-sky-50 text-sky-800 ring-sky-200",
  POST: "bg-primary-soft text-primary-deep ring-primary/25",
  PATCH: "bg-amber-50 text-amber-900 ring-amber-200",
  DELETE: "bg-red-50 text-red-800 ring-red-200",
};

function MethodPill({ method }: { method: Method }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide ring-1 ring-inset ${METHOD_TONE[method]}`}
    >
      {method}
    </span>
  );
}

function ParamTable({
  params,
}: {
  params: { name: string; type: string; required?: boolean; desc: string }[];
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-page/70">
            <th className="px-3 py-2 text-xs font-semibold text-muted">Parameter</th>
            <th className="px-3 py-2 text-xs font-semibold text-muted">Type</th>
            <th className="px-3 py-2 text-xs font-semibold text-muted">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-t border-line align-top">
              <td className="whitespace-nowrap px-3 py-2.5">
                <code className="font-mono text-[13px] font-semibold text-ink">{p.name}</code>
                {p.required && (
                  <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-wide text-red-700">
                    req
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-muted">
                {p.type}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-ink/80">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "prose":
      return (
        <p className="mt-4 text-[15px] leading-relaxed text-ink/80 [text-wrap:pretty]">
          {inline(block.text)}
        </p>
      );

    case "code":
      return <CodeBlock lang={block.lang} label={block.label} code={block.code} />;

    case "note":
      return (
        <div
          className={`mt-4 rounded-lg border p-3.5 text-[14px] leading-relaxed ${
            block.tone === "warn"
              ? "border-amber-200 bg-amber-50/70 text-amber-950"
              : "border-primary/20 bg-primary-soft/60 text-primary-dark"
          }`}
        >
          {inline(block.text)}
        </div>
      );

    case "table":
      return (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-page/70">
                {block.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-line align-top">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2.5 text-[13px] text-ink/80">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "action":
      return (
        <a
          href={block.href}
          className="group mt-4 flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary-soft/50 px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary-soft"
        >
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-primary-dark">
              {block.label}
            </span>
            {block.desc && (
              <span className="block text-[12.5px] text-primary-deep/80">{block.desc}</span>
            )}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-primary-deep transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </a>
      );

    case "steps":
      return (
        <ol className="mt-5 flex flex-col gap-4">
          {block.items.map((step, i) => (
            <li key={step.title} className="flex gap-3.5">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-contrast"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-ink">{step.title}</span>
                <span className="mt-0.5 block text-[14px] leading-relaxed text-ink/75">
                  {inline(step.body)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      );

    case "endpoint":
      return (
        <div className="mt-6 rounded-xl border border-line bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
            <MethodPill method={block.method} />
            <code className="break-all font-mono text-[13px] font-semibold text-ink">
              {block.path}
            </code>
          </div>
          <div className="px-4 pb-4 pt-3">
            <p className="text-[14px] leading-relaxed text-ink/80">{block.summary}</p>
            {block.params && <ParamTable params={block.params} />}
            {block.request && <CodeBlock lang="json" label="Request body" code={block.request} />}
            {block.response && <CodeBlock lang="json" label="Response" code={block.response} />}
          </div>
        </div>
      );
  }
}
