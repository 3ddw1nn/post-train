import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getWorkspaceStorageStatus, listFinishedMedia, listMedia, type MediaRow } from "@/lib/media";
import { listStudioDrafts } from "@/lib/studio-drafts";
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

function mediaIdsInState(state: string) {
  return [...new Set(state.match(/\bmid_[a-z0-9]+\b/gi) ?? [])];
}

/** Older finished video drafts predate `finished_media_ids`; recover only
 * their explicit render-output fields so source uploads remain untouched. */
function legacyFinishedMediaIdsInState(state: string) {
  try {
    const parsed = JSON.parse(state) as Record<string, unknown>;
    return [...new Set([
      ...(typeof parsed.outputMediaId === "string" ? [parsed.outputMediaId] : []),
      ...(Array.isArray(parsed.outputMediaIds) ? parsed.outputMediaIds.filter((id): id is string => typeof id === "string") : []),
      ...(
        parsed.platformOutputMediaIds && typeof parsed.platformOutputMediaIds === "object"
          ? Object.values(parsed.platformOutputMediaIds).filter((id): id is string => typeof id === "string")
          : []
      ),
    ])].filter((id) => /^mid_[a-z0-9]+$/i.test(id));
  } catch {
    return [];
  }
}

export default async function LibraryPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  const [lists, drafts, storage, media] = await Promise.all([
    Promise.all(TEMPLATES.map((t) => listFinishedMedia(ws.id, t.id))),
    listStudioDrafts(ws.id),
    getWorkspaceStorageStatus(ws.id),
    listMedia(ws.id, 5000, 0),
  ]);
  const mediaBytesById = new Map(media.data.map((item) => [item.id, item.size_bytes]));
  const draftProjectBytes = new Map(
    drafts.map((draft) => [
      draft.id,
      mediaIdsInState(draft.state).reduce((total, mediaId) => total + (mediaBytesById.get(mediaId) ?? 0), 0),
    ]),
  );
  const projectBytesByFinishedMediaId = new Map<string, number>();
  const draftingOutputMediaIds = new Set<string>();
  const draftingProjectNames = new Set<string>();
  for (const draft of drafts) {
    const projectBytes = draftProjectBytes.get(draft.id) ?? 0;
    const finishedMediaIds = draft.finished_media_ids?.length
      ? draft.finished_media_ids
      : legacyFinishedMediaIdsInState(draft.state);
    for (const mediaId of finishedMediaIds) projectBytesByFinishedMediaId.set(mediaId, projectBytes);
    if (draft.status !== "finished") {
      for (const mediaId of finishedMediaIds) draftingOutputMediaIds.add(mediaId);
      draftingProjectNames.add(`${draft.template}:${draft.title.trim().toLocaleLowerCase()}`);
    }
  }
  const itemsByTemplate: Record<string, MediaRow[]> = {};
  TEMPLATES.forEach((t, i) => {
    itemsByTemplate[t.id] = lists[i]
      // A project being edited belongs exclusively in Drafts. This protects
      // the UI for records finished before output ids were tracked directly.
      .filter((item) => {
        if (draftingOutputMediaIds.has(item.id)) return false;
        if (item.studio_draft_id && drafts.some((draft) => draft.id === item.studio_draft_id && draft.status !== "finished")) return false;
        // Before project ids were stored on media, the campaign title is the
        // only safe shared identity available to prevent a legacy duplicate.
        return !draftingProjectNames.has(`${item.studio_template}:${(item.studio_campaign_name ?? "").trim().toLocaleLowerCase()}`);
      })
      .map((item) => ({
      ...item,
      project_size_bytes: projectBytesByFinishedMediaId.get(item.id),
      }));
  });
  const draftsWithProjectBytes = drafts.map((draft) => ({
    ...draft,
    media_size_bytes: draftProjectBytes.get(draft.id) ?? 0,
  }));

  // ── Uploads ───────────────────────────────────────────────────────────────
  // Every stored file that isn't a finished Library item. This exists because
  // getWorkspaceStorageStatus bills *every* media row, while the Finished and
  // Drafts views only ever showed Studio output — so the storage meter filled
  // from files the user had no way to see or delete here. Finished + Drafts +
  // Uploads now accounts for the whole bill.
  //
  // Derived from the `media` list already fetched above for draft size math,
  // so this adds no queries.
  const mediaIdsUsedByDrafts = new Set(drafts.flatMap((draft) => mediaIdsInState(draft.state)));
  const uploads = media.data
    .filter((item) => !item.studio_finished_at && item.upload_status === "uploaded")
    .map((item) => ({
      ...item,
      // A Studio render sitting inside an open draft is indistinguishable from
      // a raw upload by row alone — studio_* are cleared when a project returns
      // to drafting — so "in use" can only come from joining against the drafts.
      // Deleting one would break that draft; the ?safe=1 route already refuses.
      in_use: mediaIdsUsedByDrafts.has(item.id),
    }));

  return (
    <LibraryView
      templates={TEMPLATES}
      itemsByTemplate={itemsByTemplate}
      drafts={draftsWithProjectBytes}
      uploads={uploads}
      storage={storage}
    />
  );
}
