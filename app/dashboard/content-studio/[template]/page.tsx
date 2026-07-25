import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { aiUsageThisMonth, STUDIO_TEMPLATES, type StudioTemplate } from "@/lib/studio";
import { FAL_AVATAR_PER_SECOND } from "@/lib/fal";
import { PROVIDERS, providerConfigured } from "@/lib/image-gen-keys";
import { getExploreItem, listExploreSlides } from "@/lib/explore";
import { PaywallCard } from "@/components/paywall-card";
import { StudioWizard } from "@/components/studio";
import { SlideshowStudio } from "@/components/slideshow-studio";
import { GridStudio } from "@/components/grid-studio";

export const metadata = { title: "Content Studio" };

export default async function StudioTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ template: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { template } = await params;
  const { from } = await searchParams;
  if (!STUDIO_TEMPLATES.includes(template as StudioTemplate)) notFound();
  if (!studioAccess(await getSubscription(user.id))) return <PaywallCard />;
  const ws = await currentWorkspace(user);
  const usage = await aiUsageThisMonth(ws.id);

  if (template === "grid-2x2") {
    const accounts = await accountsForWorkspace(ws.id);
    return (
      <GridStudio
        accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, avatar_url: a.avatar_url }))}
      />
    );
  }

  let initialSlideTexts: string[] | undefined;
  let sourceExploreItemId: string | undefined;
  if (template === "slideshow" && from) {
    const item = await getExploreItem(from);
    if (item) {
      const slides = await listExploreSlides(item.id);
      initialSlideTexts = slides.map((s) => s.text);
      sourceExploreItemId = item.id;
    }
  }

  if (template === "slideshow") {
    const accounts = await accountsForWorkspace(ws.id);
    const configuredEntries = await Promise.all(
      PROVIDERS.map(async (p) => [p.id, await providerConfigured(ws.id, p.id)] as const)
    );
    return (
      <SlideshowStudio
        initialSlideTexts={initialSlideTexts}
        sourceExploreItemId={sourceExploreItemId}
        accounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          username: a.username,
          avatar_url: a.avatar_url,
        }))}
        configuredProviders={Object.fromEntries(configuredEntries)}
      />
    );
  }

  return (
    <StudioWizard
      template={template as StudioTemplate}
      falPerSecond={FAL_AVATAR_PER_SECOND}
      aiUsed={usage.used}
      aiCap={usage.cap}
      initialSlideTexts={initialSlideTexts}
      sourceExploreItemId={sourceExploreItemId}
    />
  );
}
