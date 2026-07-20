"use client";

import { useRouter } from "next/navigation";
import { QuestionStep } from "../question-step";

const PERSONAS = [
  { id: "founder", title: "Founder", desc: "Building a business", icon: "zap" },
  { id: "creator", title: "Creator", desc: "Growing an audience", icon: "sparkles" },
  { id: "agency", title: "Agency", desc: "Managing client accounts", icon: "users" },
  { id: "enterprise", title: "Enterprise", desc: "Big company team", icon: "mountain" },
  { id: "small_business", title: "Small Business", desc: "Running a small business", icon: "gear" },
  { id: "personal", title: "Personal", desc: "Just for me", icon: "home" },
];

export function PersonaStep({ initial }: { initial: string | null }) {
  const router = useRouter();
  return (
    <QuestionStep
      title="What sounds most like you?"
      subtitle="We'll tune defaults and tips to match."
      ariaLabel="Persona"
      options={PERSONAS}
      initial={initial}
      onNext={async (persona) => {
        await fetch("/api/onboarding/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona }),
        });
        router.push("/onboarding/challenge");
      }}
    />
  );
}
