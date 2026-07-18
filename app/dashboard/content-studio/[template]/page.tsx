import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { currentWorkspace } from "@/lib/workspaces";
import { aiUsageThisMonth, STUDIO_TEMPLATES, type StudioTemplate } from "@/lib/studio";
import { FAL_AVATAR_PER_SECOND } from "@/lib/fal";
import { PaywallCard } from "@/components/paywall-card";
import { StudioWizard } from "@/components/studio";

export const metadata = { title: "Content Studio" };

export default async function StudioTemplatePage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const user = await requireOnboardedUser();
  const { template } = await params;
  if (!STUDIO_TEMPLATES.includes(template as StudioTemplate)) notFound();
  if (!studioAccess(await getSubscription(user.id))) return <PaywallCard />;
  const ws = await currentWorkspace(user);
  const usage = await aiUsageThisMonth(ws.id);
  return (
    <StudioWizard
      template={template as StudioTemplate}
      falPerSecond={FAL_AVATAR_PER_SECOND}
      aiUsed={usage.used}
      aiCap={usage.cap}
    />
  );
}
