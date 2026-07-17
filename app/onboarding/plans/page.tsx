import { requireUser } from "@/lib/auth";
import { PlanPicker } from "@/components/plan-picker";
import { FooterBar } from "../footer-bar";

export const metadata = { title: "Choose your plan" };

export default async function OnboardingPlans() {
  await requireUser();
  return (
    <div className="fade-up mx-auto max-w-4xl">
      <h1 className="text-center text-2xl font-bold">Choose your plan</h1>
      <p className="mt-1 text-center text-sm text-muted">
        Try for free for 7 days – cancel anytime
      </p>
      <div className="mt-8">
        <PlanPicker mode="checkout" />
      </div>
      {/* No skip on this step (spec 03 §C4) */}
      <FooterBar backHref="/onboarding/connect" />
    </div>
  );
}
