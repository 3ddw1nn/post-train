"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { FooterBar } from "../footer-bar";

const PERSONAS = [
  { id: "founder", title: "Founder", desc: "Building a business" },
  { id: "creator", title: "Creator", desc: "Growing an audience" },
  { id: "agency", title: "Agency", desc: "Managing client accounts" },
  { id: "enterprise", title: "Enterprise", desc: "Big company team" },
  { id: "small_business", title: "Small Business", desc: "Running a small business" },
  { id: "personal", title: "Personal", desc: "Just for me" },
];

export function PersonaStep({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);

  return (
    <div className="fade-up mx-auto max-w-2xl">
      <p className="text-sm font-bold lowercase text-primary-deep">almost ready</p>
      <h1 className="mt-1 text-2xl font-bold">What sounds most like you?</h1>
      <div className="mt-6 flex flex-col gap-3" role="radiogroup" aria-label="Persona">
        {PERSONAS.map((p) => {
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(p.id)}
              className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-contrast"
                  : "border-line bg-white hover:border-primary/60"
              }`}
            >
              <span>
                <span className="block font-bold">{p.title}</span>
                <span className={`block text-sm ${active ? "text-primary-contrast/80" : "text-muted"}`}>
                  {p.desc}
                </span>
              </span>
              {active && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-primary-deep">
                  <Icon name="check" size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <FooterBar
        next={
          <button
            className="btn-primary px-8"
            disabled={!selected || busy}
            onClick={async () => {
              setBusy(true);
              await fetch("/api/onboarding/persona", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ persona: selected }),
              });
              router.push("/onboarding/connect");
            }}
          >
            Next
          </button>
        }
      />
    </div>
  );
}
