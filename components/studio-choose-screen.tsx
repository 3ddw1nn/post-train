"use client";

// The "choose" screen shared by all four Content Studio templates (Grid,
// Video Editor, AI UGC, Slideshow): a back-link + icon-badge title, a "start
// something new" area, and a Drafts card below it. Previously copy-pasted
// with real drift (see the componentization survey) — most notably,
// delete-a-draft had three different behaviors: a confirm dialog wired
// through the parent (grid), no confirmation at all (ai-ugc, an accidental
// footgun), and no delete affordance whatsoever (video editor). This
// component owns a single confirm-before-delete flow so every caller gets
// the same, safer behavior for free.
//
// The CTA area is a `cta: ReactNode` slot rather than fixed title/description
// props: three studios show one CTA card (use the `StudioCtaCard` helper
// below), but Slideshow's is a genuinely different 3-card mode picker — it
// passes its own `<ModeChooser>` instead of being bent into a shape that
// doesn't fit it.
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { relativeTime } from "@/lib/format";
import type { StudioDraftRow } from "@/lib/studio-drafts";

/** The single-CTA-card shape three of the four studios use. */
export function StudioCtaCard({
  title,
  description,
  buttonLabel,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="card mt-5 p-6 sm:p-8">
      <h2 className="text-xl font-black text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
      <button type="button" onClick={onClick} className="btn-primary mt-5">
        <Icon name="plus" size={15} /> {buttonLabel}
      </button>
    </div>
  );
}

function DeleteDraftDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">Delete draft?</p>
        <p className="mt-2 text-sm text-muted">&ldquo;{title}&rdquo; will be removed. This can&rsquo;t be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-subtle" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function StudioChooseScreen({
  maxW,
  icon,
  title,
  headerExtra,
  cta,
  drafts,
  draftsLoading,
  renderPreview,
  renderBadge,
  onResume,
  onPublish,
  onDelete,
  emptyState,
  children,
}: {
  maxW: string;
  icon: string;
  title: string;
  /** e.g. the "Saving draft…" pill shown while a wizard is open — `undefined` for these studios' choose screen, kept for shape-parity with each studio's own header. */
  headerExtra?: React.ReactNode;
  cta: React.ReactNode;
  drafts: StudioDraftRow[];
  draftsLoading: boolean;
  renderPreview: (draft: StudioDraftRow) => React.ReactNode;
  /** Optional small tag rendered next to the timestamp — e.g. Slideshow's Template/Custom/Copy origin badge. */
  renderBadge?: (draft: StudioDraftRow) => React.ReactNode;
  onResume: (draft: StudioDraftRow) => void;
  /** Shown below finished cards when this studio can send its output directly to Create Post. */
  onPublish?: (draft: StudioDraftRow) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  /** Defaults to a plain "No saved drafts." — pass a richer empty state if the studio wants one. */
  emptyState?: React.ReactNode;
  /** Extra modals etc. that belong on this screen (e.g. Slideshow's "Copy from IG/TikTok" dialog). */
  children?: React.ReactNode;
}) {
  const [pendingDelete, setPendingDelete] = useState<StudioDraftRow | null>(null);
  const finishedDrafts = drafts.filter((d) => d.status === "finished");
  const activeDrafts = drafts.filter((d) => d.status !== "finished");

  const draftRow = (draft: StudioDraftRow) => {
    const publishable = draft.status === "finished" && !!onPublish;
    return (
      <div key={draft.id} className="group">
        <div className="rounded-xl border border-line bg-white p-3 transition-colors hover:border-primary hover:bg-primary-soft/30">
          <div className="flex items-center gap-3">
          <button type="button" onClick={() => onResume(draft)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {renderPreview(draft)}
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">{draft.title}</span>
              <span className="mt-1 flex items-center gap-2">
                {renderBadge?.(draft)}
                <span className="text-xs font-semibold text-muted">{relativeTime(draft.updated_at)}</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(draft)}
            aria-label={`Delete draft ${draft.title}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted opacity-100 transition-opacity hover:bg-ink/10 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <Icon name="x" size={13} />
          </button>
          </div>
        </div>
        {publishable && (
          <button type="button" onClick={() => void onPublish!(draft)} className="btn-primary mt-2 w-full justify-center">
            Publish <Icon name="sparkles" size={15} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`fade-up mx-auto w-full ${maxW} pb-10`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/content-studio" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep">
            <Icon name="chevronLeft" size={15} /> Content Studio
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-contrast">
              <Icon name={icon} size={18} />
            </span>
            {title}
          </h1>
        </div>
        {headerExtra}
      </div>

      {cta}

      {!draftsLoading && finishedDrafts.length > 0 && (
        <div className="card mt-5 border-primary/30 bg-primary-soft/20 p-6 sm:p-8">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-primary-deep">
            <Icon name="check" size={13} /> Finished — ready to publish
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {finishedDrafts.map(draftRow)}
          </div>
        </div>
      )}

      <div className="card mt-5 p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Drafts</p>
        {draftsLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-muted" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
            Loading drafts…
          </div>
        ) : activeDrafts.length === 0 ? (
          emptyState ?? <p className="mt-4 text-sm font-semibold text-muted">No saved drafts.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeDrafts.map(draftRow)}
          </div>
        )}
      </div>

      {pendingDelete && (
        <DeleteDraftDialog
          title={pendingDelete.title}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            void onDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
      {children}
    </div>
  );
}
