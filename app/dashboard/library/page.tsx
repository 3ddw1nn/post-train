import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { currentWorkspace } from "@/lib/workspaces";
import { listFinishedMedia, type MediaRow } from "@/lib/media";
import { listStudioDrafts } from "@/lib/studio-drafts";
import { PaywallCard } from "@/components/paywall-card";
import { LibraryView, type LibraryTemplate } from "@/components/library-view";

export const metadata = { title: "Library" };

// Same 5 templates as app/dashboard/content-studio/page.tsx's TEMPLATES,
// plus which Create Post 2 post type each one's output maps to.
const TEMPLATES: LibraryTemplate[] = [
  { id: "grid-2x2", label: "2x2 Grid Video", icon: "grid", postType: "video" },
  { id: "fade-in", label: "Video Editor", icon: "video", postType: "video" },
  { id: "ai-ugc", label: "AI UGC Video", icon: "sparkles", postType: "video" },
  { id: "slideshow", label: "Slideshow", icon: "image", postType: "image" },
  { id: "thumbnail", label: "Thumbnail Maker", icon: "image", postType: "image" },
];

export default async function LibraryPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  // Same gate as Content Studio: everything here only exists because a user
  // finished something in an already-gated studio, so there's no separate
  // free-tier version of this page to fall back to.
  if (!studioAccess(sub)) return <PaywallCard />;

  const ws = await currentWorkspace(user);
  const [lists, drafts] = await Promise.all([
    Promise.all(TEMPLATES.map((t) => listFinishedMedia(ws.id, t.id))),
    listStudioDrafts(ws.id),
  ]);
  const itemsByTemplate: Record<string, MediaRow[]> = {};
  TEMPLATES.forEach((t, i) => (itemsByTemplate[t.id] = lists[i]));

  return <LibraryView templates={TEMPLATES} itemsByTemplate={itemsByTemplate} drafts={drafts} />;
}
