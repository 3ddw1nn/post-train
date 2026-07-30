import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { currentWorkspace } from "@/lib/workspaces";
import { accountsForWorkspace } from "@/lib/accounts";
import { aiUsageThisMonth, STUDIO_TEMPLATES, type StudioTemplate } from "@/lib/studio";
import { PROVIDERS, providerConfigured, workspaceKeyConfigured } from "@/lib/image-gen-keys";
import { getExploreItem, listExploreSlides } from "@/lib/explore";
import { PaywallCard } from "@/components/paywall-card";
import { FadeInStudio } from "@/components/studio";
import { SlideshowStudio } from "@/components/slideshow-studio";
import { GridStudio } from "@/components/grid-studio";
import { AiUgcStudio } from "@/components/ai-ugc-studio";
import { ThumbnailStudio } from "@/components/thumbnail-studio";

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
  // "video-editor" is the current URL for what is stored as the "fade-in"
  // template; old links and existing draft/job rows keep resolving. "thumbnail"
  // is deliberately NOT in STUDIO_TEMPLATES — that list gates the async ffmpeg
  // job queue (createStudioJob), and Thumbnail Maker never queues a job: it's a
  // client canvas plus one direct AI call, saved straight to the media library.
  if (template !== "video-editor" && template !== "thumbnail" && !STUDIO_TEMPLATES.includes(template as StudioTemplate)) notFound();
  if (!studioAccess(await getSubscription(user.id))) return <PaywallCard />;
  const ws = await currentWorkspace(user);
  const usage = await aiUsageThisMonth(ws.id);

  if (template === "thumbnail") {
    // BYOK-required — checks the workspace's own key only, no env fallback,
    // matching the /api/app/tools/thumbnail route's resolveWorkspaceKey gate.
    const configuredEntries = await Promise.all(
      PROVIDERS.map(async (p) => [p.id, await workspaceKeyConfigured(ws.id, p.id)] as const)
    );
    return <ThumbnailStudio configuredProviders={Object.fromEntries(configuredEntries)} />;
  }

  if (template === "grid-2x2") {
    const accounts = await accountsForWorkspace(ws.id);
    return (
      <GridStudio
        accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, avatar_url: a.avatar_url }))}
      />
    );
  }

  if (template === "fade-in" || template === "video-editor") {
    const accounts = await accountsForWorkspace(ws.id);
    return <FadeInStudio accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, avatar_url: a.avatar_url }))} />;
  }

  if (template === "ai-ugc") {
    const accounts = await accountsForWorkspace(ws.id);
    return (
      <AiUgcStudio
        accounts={accounts.map((account) => ({
          id: account.id,
          platform: account.platform,
          username: account.username,
          avatar_url: account.avatar_url,
        }))}
        avatarPerSecond={0.025}
        aiUsed={usage.used}
        aiCap={usage.cap}
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

  notFound();
}
