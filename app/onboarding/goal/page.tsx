import { requireUser } from "@/lib/auth";
import { GoalStep } from "./goal-step";

export const metadata = { title: "Your #1 goal" };

export default async function OnboardingGoal() {
  await requireUser();
  return <GoalStep />;
}
