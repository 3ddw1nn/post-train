"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

export type QuestionOption = { id: string; title: string; desc: string; icon: string };

export function QuestionStep({
  title,
  subtitle,
  options,
  initial,
  ariaLabel,
  backHref,
  onNext,
}: {
  title: string;
  subtitle: string;
  options: QuestionOption[];
  initial: string | null;
  ariaLabel: string;
  backHref?: string;
  /** Called with the selected option id right after the pick registers visually. */
  onNext: (selected: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);

  async function choose(id: string) {
    if (busy) return;
    setSelected(id);
    setBusy(true);
    await new Promise((r) => setTimeout(r, 220)); // let the selection register before advancing
    await onNext(id);
  }

  return (
    <div className="fade-up mx-auto max-w-2xl">
      {backHref && (
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
        >
          <Icon name="chevronLeft" size={15} /> Back
        </Link>
      )}
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <div className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label={ariaLabel}>
        {options.map((o) => {
          const active = selected === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => choose(o.id)}
              className={`flex items-center gap-4 rounded-2xl border bg-white px-5 py-4 text-left transition-colors disabled:cursor-not-allowed ${
                active ? "border-primary ring-1 ring-primary" : "border-line hover:border-primary/50"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  active ? "bg-primary text-primary-contrast" : "bg-page text-primary-deep"
                }`}
              >
                <Icon name={o.icon} size={18} strokeWidth={1.8} />
              </span>
              <span className="flex-1">
                <span className="block font-bold">{o.title}</span>
                <span className="block text-sm text-muted">{o.desc}</span>
              </span>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? "border-primary bg-primary" : "border-line"
                }`}
              >
                {active && <Icon name="check" size={11} strokeWidth={3} className="text-primary-contrast" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
