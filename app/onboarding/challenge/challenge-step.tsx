"use client";

import { useRouter } from "next/navigation";
import { QuestionStep } from "../question-step";

const CHALLENGES = [
  { id: "reposting", title: "Reposting everywhere", desc: "Uploading the same clip to every platform, one at a time.", icon: "copy" },
  { id: "consistency", title: "Staying consistent", desc: "I mean to post daily, then a week goes by.", icon: "clock" },
  { id: "multi_account", title: "Managing multiple accounts", desc: "Client or brand accounts I have to juggle.", icon: "users" },
  { id: "tracking", title: "Tracking what worked", desc: "No easy way to see performance across platforms.", icon: "chart" },
];

export function ChallengeStep() {
  const router = useRouter();
  return (
    <QuestionStep
      title="What's your biggest challenge?"
      subtitle="Be honest — this just tunes what we show you first."
      ariaLabel="Biggest challenge"
      options={CHALLENGES}
      initial={null}
      backHref="/onboarding/start"
      onNext={async () => {
        router.push("/onboarding/goal");
      }}
    />
  );
}
