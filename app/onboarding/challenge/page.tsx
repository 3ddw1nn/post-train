import { requireUser } from "@/lib/auth";
import { ChallengeStep } from "./challenge-step";

export const metadata = { title: "Your biggest challenge" };

export default async function OnboardingChallenge() {
  await requireUser();
  return <ChallengeStep />;
}
