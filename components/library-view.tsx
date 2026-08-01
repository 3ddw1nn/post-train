"use client";

// Tabbed view of "finished" Content Studio outputs — one tab per template.
// An item only lands here once a studio's Finish button has been clicked
// (see app/api/app/studio/finish/route.ts); this is deliberately NOT the
// same thing as the old auto-populated "My videos" list that got removed.
// A Finished/Drafts switch shares the same template tabs and reuses
// studio_drafts (state a wizard saves as it's edited, before Finish).
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { MediaThumb } from "./media";
import { PlatformIcon } from "./platform-icon";
import { formatBytes, relativeTime } from "@/lib/format";
import type { MediaRow, WorkspaceStorageStatus } from "@/lib/media";
import type { StudioDraftRow } from "@/lib/studio-drafts";

export type LibraryTemplate = {
  id: string;
  label: string;
  icon: string;
  /** Which Create Post 2 post type this template's output maps to. */
  postType: "video" | "image";
};

function groupByBatch(items: MediaRow[]): MediaRow[][] {
  const groups = new Map<string, MediaRow[]>();
  for (const item of items) {
    const key = item.studio_batch_id || item.id;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

function LibraryCard({ group, template, onRemoved }: { group: MediaRow[]; template?: LibraryTemplate; onRemoved: (ids: string[], freedBytes: number) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const primary = group[0];
  const mediaIds = group.map((m) => m.id).join(",");
  const postType = template?.postType ?? "video";
  const campaignName = primary.studio_campaign_name?.trim() || template?.label || "Finished project";
  const platformIds = primary.studio_platform_ids ?? [];
  const projectBytes = primary.project_size_bytes ?? group.reduce((total, media) => total + Math.max(0, media.size_bytes), 0);

  async function remove() {
    setRemoving(true);
    setRemoveError(null);
    const results = await Promise.all(group.map(async (media) => ({
      media,
      response: await fetch(`/api/app/media/${media.id}?safe=1`, { method: "DELETE" }),
    })));
    const deleted = results.filter((result) => result.response.ok).map((result) => result.media);
    if (deleted.length > 0) {
      onRemoved(deleted.map((media) => media.id), deleted.reduce((sum, media) => sum + media.size_bytes, 0));
    }
    const failed = results.find((result) => !result.response.ok);
    if (failed) {
      const body = await failed.response.json().catch(() => null);
      setRemoveError(body?.error?.message ?? "This file couldn't be deleted.");
      setRemoving(false);
      return;
    }
    setConfirmOpen(false);
    setRemoving(false);
  }

  return (
    <div className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      {/* MediaThumb's `full` mode rounds all four corners of the video/image
          itself — fine standalone, but nested in this card it made the
          bottom corners notch into the card's own background instead of
          sitting flush against the text below. This card's own overflow-hidden
          + rounded-xl already handles the outer corners, so the media
          element itself should be square. */}
      <div className="relative bg-page [&>img]:rounded-none [&>video]:rounded-none">
        <MediaThumb media={primary} size={0} full />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          {template && (
            <span className="flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
              <Icon name={template.icon} size={12} /> {template.label}
            </span>
          )}
          {group.length > 1 && (
            <span className="ml-auto rounded-full bg-ink/70 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
              {group.length} slides
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="truncate text-sm font-bold text-ink" title={campaignName}>{campaignName}</p>
          <div className="mt-1 flex min-h-5 items-center gap-2 text-xs font-semibold text-muted">
            <span>Finished {relativeTime(primary.studio_finished_at ?? primary.created_at)}</span>
            <span aria-label={`Project size: ${formatStorage(projectBytes)}`}>· {formatStorage(projectBytes)}</span>
            {platformIds.length > 0 && (
              <span className="flex items-center gap-1.5" aria-label={`Selected platforms: ${platformIds.join(", ")}`}>
                {platformIds.map((id) => <PlatformIcon key={id} id={id} size={14} />)}
              </span>
            )}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Link href={`/dashboard/create/${postType}?media=${mediaIds}`} className="btn-primary flex-1 !py-1.5 text-center text-sm">
            Create post
          </Link>
          {template && (
            <Link
              href={`/dashboard/content-studio/${template.id}`}
              aria-label={`Edit in ${template.label}`}
              title={`Edit in ${template.label}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary-deep"
            >
              <Icon name="pencil" size={14} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={removing}
            aria-label="Delete file from Library"
            title="Delete file from Library"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-danger/40 hover:bg-danger/5 hover:text-danger disabled:opacity-50"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold">Delete this file?</p>
            <p className="mt-2 text-sm text-muted">
              This permanently removes &ldquo;{campaignName}&rdquo; and frees its storage. Files used by a post or active draft are protected and won&apos;t be deleted.
            </p>
            {removeError && <p className="mt-3 rounded-lg bg-danger/5 px-3 py-2 text-sm font-semibold text-danger">{removeError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-subtle" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" disabled={removing} onClick={() => void remove()}>
                {removing ? "Deleting…" : "Delete file"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftCard({ draft, template, onDeleted }: { draft: StudioDraftRow; template?: LibraryTemplate; onDeleted: (id: string) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    await fetch(`/api/app/studio/drafts/${draft.id}`, { method: "DELETE" });
    onDeleted(draft.id);
  }

  return (
    <div className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative h-40 bg-page">
        {draft.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-deep">
              <Icon name={template?.icon ?? "video"} size={26} />
            </span>
          </div>
        )}
        {template && (
          <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
            <Icon name={template.icon} size={12} /> {template.label}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="truncate text-sm font-bold text-ink" title={draft.title}>{draft.title}</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            Updated {relativeTime(draft.updated_at)} · {formatStorage(draft.media_size_bytes ?? 0)}
          </p>
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Link href={`/dashboard/content-studio/${draft.template}`} className="btn-primary flex-1 !py-1.5 text-center text-sm">
            Resume
          </Link>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete draft ${draft.title}`}
            title="Delete draft"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-danger/40 hover:bg-danger/5 hover:text-danger"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold">Delete draft?</p>
            <p className="mt-2 text-sm text-muted">
              &ldquo;{draft.title}&rdquo; will be permanently removed. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-subtle" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" disabled={deleting} onClick={() => void remove()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ALL_TAB = "all";
type ViewMode = "finished" | "drafts";

function formatStorage(bytes: number) {
  const formatted = formatBytes(bytes);
  return formatted === "1.0 GB" ? "1 GB" : formatted;
}

export function LibraryView({
  templates,
  itemsByTemplate,
  drafts,
  storage,
}: {
  templates: LibraryTemplate[];
  itemsByTemplate: Record<string, MediaRow[]>;
  drafts: StudioDraftRow[];
  storage: WorkspaceStorageStatus;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("finished");
  const [active, setActive] = useState<string>(ALL_TAB);
  const [items, setItems] = useState(itemsByTemplate);
  // A draft that's been through Finish already shows up as a finished item
  // above — only the still-in-progress ones belong in this tab.
  const [draftItems, setDraftItems] = useState(() => drafts.filter((d) => d.status !== "finished"));
  const [usedBytes, setUsedBytes] = useState(storage.usedBytes);
  useEffect(() => setUsedBytes(storage.usedBytes), [storage.usedBytes]);

  const templateById = new Map(templates.map((t) => [t.id, t]));
  const activeTemplate = templateById.get(active);

  const finishedTotal = templates.reduce((sum, t) => sum + (items[t.id]?.length ?? 0), 0);
  const draftsTotal = draftItems.length;

  const activeFinishedItems = active === ALL_TAB ? templates.flatMap((t) => items[t.id] ?? []) : items[active] ?? [];
  const finishedGroups = groupByBatch(activeFinishedItems);
  const activeDrafts = active === ALL_TAB ? draftItems : draftItems.filter((d) => d.template === active);

  function removeGroup(ids: string[], freedBytes: number) {
    setItems((current) => {
      const next = { ...current };
      for (const templateId of Object.keys(next)) {
        next[templateId] = next[templateId].filter((m) => !ids.includes(m.id));
      }
      return next;
    });
    setUsedBytes((current) => Math.max(0, current - freedBytes));
  }

  function removeDraft(id: string) {
    setDraftItems((current) => current.filter((d) => d.id !== id));
    router.refresh();
  }

  function countFor(templateId: string) {
    return viewMode === "finished" ? (items[templateId]?.length ?? 0) : draftItems.filter((d) => d.template === templateId).length;
  }

  const activeTotal = viewMode === "finished" ? finishedTotal : draftsTotal;
  const storagePercent = Math.min(100, (usedBytes / storage.limitBytes) * 100);
  const storageFull = usedBytes >= storage.limitBytes;

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="mt-1 text-sm text-muted">
            {viewMode === "finished"
              ? "Everything you've finished from Content Studio, ready to post."
              : "Everything still in progress in Content Studio."}
          </p>
        </div>
        <div className="relative inline-flex items-center rounded-full border border-line bg-page p-1" aria-label="Library view">
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-24 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
            style={{ transform: viewMode === "drafts" ? "translateX(96px)" : "translateX(0)" }}
          />
          {(["finished", "drafts"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`relative z-10 w-24 rounded-full py-1.5 text-sm font-bold capitalize transition-colors ${
                viewMode === mode ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <section className={`mt-5 rounded-xl border p-4 sm:p-5 ${storageFull ? "border-danger/30 bg-danger/5" : "border-line bg-white"}`} aria-labelledby="library-storage-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${storageFull ? "bg-danger/10 text-danger" : "bg-primary-soft text-primary-deep"}`}>
                <Icon name="stack" size={16} />
              </span>
              <div>
                <h2 id="library-storage-heading" className="text-sm font-extrabold">Workspace storage</h2>
                <p className="text-xs font-semibold text-muted">{formatStorage(usedBytes)} of {formatStorage(storage.limitBytes)} used</p>
              </div>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${storage.autoCleanup ? "bg-primary-soft text-primary-deep" : "bg-page text-muted"}`}>
            Auto cleanup {storage.autoCleanup ? "on" : "off"}
          </span>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-page" role="progressbar" aria-label="Workspace storage used" aria-valuemin={0} aria-valuemax={storage.limitBytes} aria-valuenow={Math.min(usedBytes, storage.limitBytes)}>
          <div className={`h-full rounded-full transition-[width] ${storageFull ? "bg-danger" : "bg-primary"}`} style={{ width: `${storagePercent}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs leading-5 text-muted">
            {storageFull
              ? "Storage is full. Delete files below or turn on automatic cleanup before adding more media."
              : storage.autoCleanup
                ? "At 1 GB, automatic cleanup deletes the oldest files not used by a post or draft. Turn it off in Storage settings."
                : "Automatic cleanup is off. New uploads will stop when this meter reaches 1 GB."}
          </p>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/settings#storage" className="text-xs font-bold text-primary-deep hover:underline">Storage settings</Link>
            {storageFull && (
              <>
                <a href="#library-files" className="btn-subtle !px-3 !py-1.5 text-xs">Delete files</a>
              </>
            )}
          </div>
        </div>
      </section>

      <div id="library-files" className="mt-5 flex scroll-mt-24 flex-wrap gap-1.5 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setActive(ALL_TAB)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
            active === ALL_TAB ? "border-primary bg-primary-soft text-primary-deep" : "border-line bg-white text-muted hover:text-ink"
          }`}
        >
          <Icon name="stack" size={14} /> All
          {activeTotal > 0 && <span className={active === ALL_TAB ? "text-primary-deep/70" : "text-muted/70"}>{activeTotal}</span>}
        </button>
        {templates.map((t) => {
          const count = countFor(t.id);
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
                isActive ? "border-primary bg-primary-soft text-primary-deep" : "border-line bg-white text-muted hover:text-ink"
              }`}
            >
              <Icon name={t.icon} size={14} /> {t.label}
              {count > 0 && <span className={isActive ? "text-primary-deep/70" : "text-muted/70"}>{count}</span>}
            </button>
          );
        })}
      </div>

      {viewMode === "finished" ? (
        finishedGroups.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line bg-page/50 p-10 text-center">
            <p className="text-sm font-bold text-ink">Nothing finished {active === ALL_TAB ? "" : "here "}yet</p>
            <p className="mt-1 text-sm text-muted">
              {active === ALL_TAB
                ? "Click Finish on any studio's last step to save something here."
                : `Click Finish on the ${activeTemplate?.label} studio's last step to save something here.`}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {finishedGroups.map((group) => {
              const groupTemplate = active === ALL_TAB ? templateById.get(group[0].studio_template ?? "") : activeTemplate;
              return (
                <LibraryCard
                  key={group[0].studio_batch_id || group[0].id}
                  group={group}
                  template={groupTemplate}
                  onRemoved={removeGroup}
                />
              );
            })}
          </div>
        )
      ) : activeDrafts.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-page/50 p-10 text-center">
          <p className="text-sm font-bold text-ink">No drafts {active === ALL_TAB ? "" : "here "}yet</p>
          <p className="mt-1 text-sm text-muted">
            {active === ALL_TAB
              ? "Start a template in Content Studio and it'll be saved here automatically as you go."
              : `Start the ${activeTemplate?.label} studio and it'll be saved here automatically as you go.`}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeDrafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} template={templateById.get(draft.template)} onDeleted={removeDraft} />
          ))}
        </div>
      )}
    </div>
  );
}
