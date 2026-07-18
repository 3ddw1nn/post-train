import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";
import { PlanPicker } from "@/components/plan-picker";

export const metadata = { title: "Plans" };

export default async function PlansPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  return (
    <div className="mx-auto max-w-4xl">
      <PlanPicker mode="checkout" currentPlan={entitled(sub) ? sub!.plan : undefined} />
    </div>
  );
}
