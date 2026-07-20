"use client";

import { useRouter } from "next/navigation";
import { QuestionStep } from "../question-step";

const GOALS = [
  { id: "consistency", title: "Post consistently", desc: "Stop missing days without thinking about it.", icon: "calendar" },
  { id: "reach", title: "Grow reach", desc: "Get in front of more people, on more platforms.", icon: "zap" },
  { id: "time", title: "Save time", desc: "Spend less time on the busywork of publishing.", icon: "clock" },
  { id: "clients", title: "Manage for others", desc: "Run posting for clients or a team.", icon: "users" },
];

export function GoalStep() {
  const router = useRouter();
  return (
    <QuestionStep
      title="What's your #1 goal right now?"
      subtitle="We'll prioritize what we show you next."
      ariaLabel="Primary goal"
      options={GOALS}
      initial={null}
      backHref="/onboarding/challenge"
      onNext={async () => {
        router.push("/onboarding/tour/cross-post");
      }}
    />
  );
}
