"use client";

// Batch Scheduler: turn many assets into many scheduled posts in one pass.
//
// This replaces the old three-card hub (Bulk Video Upload / Bulk Image Upload /
// Bulk Video Creation). That version could only ever see files you uploaded to
// it right then — anything you made in Content Studio or already had in the
// Library was invisible, so the Studio → Library → publish pipeline dead-ended
// here and you had to re-upload your own content. Library is now the primary
// source and upload is the secondary one, which is what makes this a stage of
// the pipeline instead of a parallel universe with its own uploader.
//
// The "Bulk Video Creation" card is gone rather than rebuilt: it was a stub
// that rendered two links back out to Content Studio, badged NEW.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Select } from "@/components/interactive";
import { AccountAvatar, PlatformIconRow } from "@/components/platform-icon";
import { MediaThumb, type ComposerMedia } from "@/components/media";
import { MediaFilterBar } from "@/components/media-filter-bar";
import {
  EMPTY_FILTER,
  applyMediaFilter,
  facetCounts,
  platformIdsFor,
  platformsPresent,
  type MediaFilter,
} from "@/lib/media-filters";
import { CAPTION_MAX, platform as platformOf, type PostType } from "@/lib/platforms";

type Account = { id: number; platform: string; username: string; avatar_url: string | null };

type Row = {
  media: ComposerMedia;
  caption: string;
  /** Local "YYYY-MM-DDTHH:mm". Unused in queue mode — the server picks slots. */
  at: string;
  status: "pending" | "working" | "done" | "error";
  error?: string;
};

/** Batching is a sequential POST loop, so this is a real wall-clock cost, not
 *  an arbitrary cap. The old page claimed "100+" in its banner while enforcing
 *  30 — this number and the copy below it are deliberately the same. */
const MAX_BATCH = 50;
const MAX_BYTES = 250 * 1024 * 1024;
const MIN_DUR = 3;
const MAX_DUR = 120;

/** Only these can become posts; the Library also holds pdf/audio. */
const POSTABLE = new Set(["image", "video"]);

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(el.duration);
    };
    el.onerror = () => resolve(NaN);
    el.src = URL.createObjectURL(file);
  });
}

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function BatchScheduler({
  accounts,
  hasQueue,
  prefFilenameCaption,
}: {
  accounts: Account[];
  hasQueue: boolean;
  prefFilenameCaption: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [library, setLibrary] = useState<ComposerMedia[] | null>(null);
  const [libFilter, setLibFilter] = useState<MediaFilter>(EMPTY_FILTER);
  const [uploading, setUploading] = useState(0);
  const [toasts, setToasts] = useState<string[]>([]);
  const [bulkCaption, setBulkCaption] = useState("");
  const [mode, setMode] = useState<"queue" | "spread">(hasQueue ? "queue" : "spread");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("11:00");
  const [perDay, setPerDay] = useState(1);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ ok: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pickerOpen || library) return;
    fetch("/api/app/media")
      .then((r) => r.json())
      .then((d) => setLibrary((d.data ?? []).filter((m: ComposerMedia) => POSTABLE.has(m.kind))))
      .catch(() => setLibrary([]));
  }, [pickerOpen, library]);

  function toast(msg: string) {
    setToasts((t) => [...t, msg]);
    setTimeout(() => setToasts((t) => t.slice(1)), 3500);
  }

  const chosenIds = useMemo(() => new Set(rows.map((r) => r.media.id)), [rows]);

  /** Accounts that support every media kind currently in the batch. Mixing a
   *  video and an image narrows the list rather than silently sending each
   *  item to a different subset — a fan-out you can't see is a fan-out you
   *  can't verify afterwards. */
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.media.kind))], [rows]);
  const eligible = useMemo(
    () =>
      accounts.filter((a) => {
        const p = platformOf(a.platform);
        return p && kinds.every((k) => p.supports.includes(k as PostType));
      }),
    [accounts, kinds]
  );
  const eligibleIds = useMemo(() => new Set(eligible.map((a) => a.id)), [eligible]);
  const activeSelection = useMemo(
    () => [...selected].filter((id) => eligibleIds.has(id)),
    [selected, eligibleIds]
  );

  function addMedia(media: ComposerMedia) {
    setRows((r) =>
      r.length >= MAX_BATCH
        ? r
        : [
            ...r,
            {
              media,
              caption: prefFilenameCaption ? media.name.replace(/\.[^.]+$/, "") : "",
              at: "",
              status: "pending",
            },
          ]
    );
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (rows.length + list.length > MAX_BATCH) {
      toast(`Limit is ${MAX_BATCH} items per batch.`);
      return;
    }
    let accepted = 0;
    for (const file of list) {
      if (file.size > MAX_BYTES) {
        toast(`${file.name}: over the 250MB limit — skipped.`);
        continue;
      }
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/")) {
        toast(`${file.name}: not an image or video — skipped.`);
        continue;
      }
      if (isVideo) {
        const dur = await videoDuration(file);
        if (!isNaN(dur) && (dur < MIN_DUR || dur > MAX_DUR)) {
          toast(`${file.name}: must be 3s–2min (${Math.round(dur)}s) — skipped.`);
          continue;
        }
      }
      setUploading((u) => u + 1);
      try {
        const res = await fetch("/api/app/media/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mime_type: file.type, size_bytes: file.size, name: file.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
        const put = await fetch(data.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed");
        addMedia({
          id: data.media_id,
          name: file.name,
          mime_type: file.type,
          kind: isVideo ? "video" : "image",
        });
        // New uploads land in the Library too — drop the cache so reopening
        // the picker doesn't show a stale list missing what you just added.
        setLibrary(null);
        accepted++;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((u) => u - 1);
      }
    }
    if (accepted > 0) toast(`${accepted} item(s) added.`);
  }

  function applySpread() {
    if (!startDate) {
      setError("Pick a start date first.");
      return;
    }
    setError(null);
    setRows((r) =>
      r.map((row, i) => {
        const d = new Date(`${startDate}T${startTime || "11:00"}`);
        d.setDate(d.getDate() + Math.floor(i / perDay));
        d.setMinutes(d.getMinutes() + (i % perDay) * 30); // stagger same-day posts
        return { ...row, at: localInput(d) };
      })
    );
  }

  async function scheduleAll() {
    if (activeSelection.length === 0) {
      setError("Select at least one account.");
      return;
    }
    if (mode === "spread" && rows.some((r) => r.status !== "done" && !r.at)) {
      setError("Some items have no date — use Apply spread, or set them individually.");
      return;
    }
    setError(null);
    setRunning(true);
    setSummary(null);

    let ok = 0;
    let failed = 0;
    // ponytail: one POST per item, sequentially. Ceiling is MAX_BATCH * ~1
    // round trip; queue mode also does a slot scan per post. Upgrade path is a
    // real bulk endpoint that creates N posts in one transaction. Sequential
    // is deliberate for now: it keeps "already scheduled" unambiguous when a
    // later item fails, which is what makes retry safe below.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.status === "done") continue; // retry skips what already landed
      setRows((r) => r.map((x, j) => (j === i ? { ...x, status: "working" } : x)));
      try {
        const res = await fetch("/api/app/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: row.media.kind,
            caption: row.caption,
            media: [row.media.id],
            social_accounts: activeSelection,
            ...(mode === "queue"
              ? { use_queue: true }
              : { scheduled_at: new Date(row.at).toISOString() }),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message ?? "Failed to schedule");
        }
        ok++;
        setRows((r) => r.map((x, j) => (j === i ? { ...x, status: "done", error: undefined } : x)));
      } catch (e) {
        failed++;
        setRows((r) =>
          r.map((x, j) =>
            j === i
              ? { ...x, status: "error", error: e instanceof Error ? e.message : "Failed" }
              : x
          )
        );
      }
    }

    setRunning(false);
    setSummary({ ok, failed });
    router.refresh();
  }

  const pending = rows.filter((r) => r.status !== "done").length;
  const spreadDays = pending ? Math.ceil(pending / perDay) : 0;
  // Anything in the Library not already queued. Facet counts come off this
  // rather than the raw library so a filter can't advertise items that are all
  // already in the batch.
  const available = library?.filter((m) => !chosenIds.has(m.id)) ?? null;
  const libCounts = facetCounts(available ?? [], libFilter);
  const libPlatforms = platformsPresent(available ?? []);
  const visibleLibrary = available === null ? null : applyMediaFilter(available, libFilter);

  return (
    <div className="fade-up pb-10">
      <div className="pointer-events-none fixed left-1/2 top-4 z-[80] flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t, i) => (
          <p
            key={i}
            className="fade-up rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-lg"
          >
            {t}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-contrast">
              <Icon name="stack" size={18} />
            </span>
            Batch Scheduler
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Turn a pile of finished assets into a filled calendar. Pull from your Library or
            drop in new files, pick where they go, and schedule up to {MAX_BATCH} posts at once.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="card p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Content</p>
              <span className="text-xs font-semibold text-muted">
                {rows.length}/{MAX_BATCH}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className={pickerOpen ? "btn-primary" : "btn-subtle"}
                aria-expanded={pickerOpen}
              >
                <Icon name="folder" size={15} /> From Library
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="btn-subtle"
              >
                <Icon name="upload" size={15} /> Upload files
              </button>
              {uploading > 0 && (
                <span className="flex items-center gap-2 text-sm font-semibold text-primary-deep">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Uploading…
                </span>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept="image/*,video/*"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {pickerOpen && (
              <div className="mt-4 rounded-xl border border-line bg-page/60 p-4">
                {visibleLibrary === null ? (
                  <p className="py-6 text-center text-sm font-semibold text-muted">
                    Loading your Library…
                  </p>
                ) : available!.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm font-semibold text-ink">
                      {library?.length ? "Everything here is already in the batch." : "Your Library is empty."}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                      Finished videos and images from Content Studio show up here automatically.
                    </p>
                    {!library?.length && (
                      <Link href="/dashboard/content-studio" className="btn-subtle mt-3">
                        <Icon name="sparkles" size={15} /> Open Content Studio
                      </Link>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-muted">
                      Tap to add. Studio outputs and uploads both live here.
                    </p>
                    <MediaFilterBar
                      className="mt-2.5"
                      filter={libFilter}
                      onChange={setLibFilter}
                      counts={libCounts}
                      platforms={libPlatforms}
                    />
                    {visibleLibrary.length === 0 ? (
                      <p className="py-8 text-center text-sm font-semibold text-muted">
                        Nothing matches those filters.
                      </p>
                    ) : (
                      <div className="mt-3 grid max-h-80 grid-cols-3 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-5">
                        {visibleLibrary.map((m) => {
                          const madeFor = platformIdsFor(m);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => addMedia(m)}
                              disabled={rows.length >= MAX_BATCH}
                              title={
                                madeFor.length
                                  ? `${m.name} — made for ${madeFor
                                      .map((id) => platformOf(id)?.name ?? id)
                                      .join(", ")}`
                                  : m.name
                              }
                              className="group relative overflow-hidden rounded-lg border border-line bg-white transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <span className="relative grid aspect-square place-items-center overflow-hidden bg-ink">
                                <MediaThumb media={m} size={120} fill />
                                {/* Square crop makes a 9:16 video and a photo
                                    look alike in the All view — the badge is
                                    what tells them apart without filtering. */}
                                {m.kind === "video" && (
                                  <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-ink/75 text-white">
                                    <Icon name="video" size={11} />
                                  </span>
                                )}
                                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-primary-deep opacity-0 shadow transition-opacity group-hover:opacity-100">
                                  <Icon name="plus" size={13} strokeWidth={3} />
                                </span>
                              </span>
                              {/* Which platform this export was rendered for —
                                  a 9:16 TikTok cut and a 1:1 Instagram one are
                                  otherwise indistinguishable at this size. */}
                              <span className="flex h-6 items-center justify-center gap-1 px-1">
                                {madeFor.length > 0 ? (
                                  <PlatformIconRow ids={madeFor} size={12} />
                                ) : (
                                  <span className="text-[10px] font-semibold text-muted">Upload</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Selected items */}
            {rows.length === 0 ? (
              <div className="mt-5 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-page text-muted">
                  <Icon name="stack" size={20} />
                </span>
                <p className="mt-3 font-bold text-ink">Nothing queued yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                  Add finished content from your Library, or upload a folder of videos. Each item
                  becomes its own post, scheduled across the days ahead.
                </p>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                {rows.map((row, i) => (
                  <div
                    key={row.media.id}
                    className={`flex flex-wrap items-start gap-3 rounded-xl border p-3 transition-colors ${
                      row.status === "done"
                        ? "border-primary/30 bg-primary-soft/25"
                        : row.status === "error"
                          ? "border-red-200 bg-red-50/60"
                          : "border-line bg-white"
                    }`}
                  >
                    <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink">
                      <MediaThumb media={row.media} size={64} fill />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{row.media.name}</p>
                        {row.status === "done" && (
                          <span className="pill shrink-0 bg-primary-soft text-primary-deep">
                            <Icon name="check" size={11} strokeWidth={3} /> Scheduled
                          </span>
                        )}
                        {row.status === "working" && (
                          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${row.media.name}`}
                          disabled={running}
                          className="ml-auto shrink-0 text-muted hover:text-danger disabled:opacity-40"
                          onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>

                      {row.status === "done" ? (
                        <p className="mt-1.5 truncate text-xs text-muted">
                          {row.caption || <span className="italic">No caption</span>}
                        </p>
                      ) : (
                        <>
                          <div className="relative mt-2">
                            <textarea
                              className="input h-16 resize-y"
                              placeholder="Caption for this post…"
                              value={row.caption}
                              maxLength={CAPTION_MAX}
                              onChange={(e) =>
                                setRows((r) =>
                                  r.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x))
                                )
                              }
                            />
                            <span className="absolute bottom-1.5 right-2.5 text-[10px] text-muted">
                              {row.caption.length}/{CAPTION_MAX}
                            </span>
                          </div>
                          {mode === "spread" && (
                            <input
                              type="datetime-local"
                              className="input mt-2 w-auto"
                              value={row.at}
                              onChange={(e) =>
                                setRows((r) =>
                                  r.map((x, j) => (j === i ? { ...x, at: e.target.value } : x))
                                )
                              }
                            />
                          )}
                        </>
                      )}
                      {row.error && (
                        <p className="mt-1.5 text-xs font-semibold text-danger">{row.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Rail ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Post to</p>
            {accounts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No accounts connected —{" "}
                <Link href="/dashboard/connections" className="font-semibold text-primary-deep hover:underline">
                  connect one first
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {eligible.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      title={`@${a.username} · ${platformOf(a.platform)?.name}`}
                      onClick={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          return next;
                        })
                      }
                    >
                      <AccountAvatar
                        username={a.username}
                        platformId={a.platform}
                        avatarUrl={a.avatar_url}
                        size={40}
                        selected={selected.has(a.id)}
                      />
                    </button>
                  ))}
                </div>
                {kinds.length > 1 && (
                  <p className="mt-2.5 text-xs text-muted">
                    Showing accounts that support both images and video, since your batch mixes
                    the two.
                  </p>
                )}
                {rows.length > 0 && eligible.length === 0 && (
                  <p className="mt-2.5 text-xs font-semibold text-danger">
                    None of your accounts support every media type in this batch.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="card p-5">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Caption</p>
            <div className="relative mt-3">
              <textarea
                className="input h-20 resize-y"
                value={bulkCaption}
                maxLength={CAPTION_MAX}
                onChange={(e) => setBulkCaption(e.target.value)}
                placeholder="One caption for every post…"
              />
              <span className="absolute bottom-1.5 right-2.5 text-[10px] text-muted">
                {bulkCaption.length}/{CAPTION_MAX}
              </span>
            </div>
            <button
              type="button"
              className="btn-subtle mt-2 w-full"
              disabled={!bulkCaption.trim() || pending === 0}
              onClick={() =>
                setRows((r) =>
                  r.map((x) => (x.status === "done" ? x : { ...x, caption: bulkCaption }))
                )
              }
            >
              Apply to all {pending} item{pending === 1 ? "" : "s"}
            </button>
          </div>

          <div className="card p-5">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Timing</p>
            <div className="mt-3 flex flex-col gap-2">
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                  mode === "queue" ? "border-primary bg-primary-soft/40" : "border-line hover:bg-page"
                } ${!hasQueue ? "cursor-not-allowed opacity-55" : ""}`}
              >
                <input
                  type="radio"
                  name="timing"
                  className="mt-0.5 accent-[var(--color-primary)]"
                  checked={mode === "queue"}
                  disabled={!hasQueue}
                  onChange={() => setMode("queue")}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">Fill my queue slots</span>
                  <span className="block text-xs leading-snug text-muted">
                    {hasQueue
                      ? "Each post takes the next free slot from your posting schedule."
                      : "No queue schedule set up yet."}
                  </span>
                  {!hasQueue && (
                    <Link
                      href="/dashboard/settings/queue"
                      className="mt-1 inline-block text-xs font-bold text-primary-deep hover:underline"
                    >
                      Set up a queue →
                    </Link>
                  )}
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                  mode === "spread" ? "border-primary bg-primary-soft/40" : "border-line hover:bg-page"
                }`}
              >
                <input
                  type="radio"
                  name="timing"
                  className="mt-0.5 accent-[var(--color-primary)]"
                  checked={mode === "spread"}
                  onChange={() => setMode("spread")}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">Spread over days</span>
                  <span className="block text-xs leading-snug text-muted">
                    Pick a start date and how many go out per day.
                  </span>
                </span>
              </label>
            </div>

            {mode === "spread" && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="block text-xs font-bold" htmlFor="batch-start-date">
                      Start date
                    </label>
                    <input
                      id="batch-start-date"
                      type="date"
                      className="input mt-1"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="block text-xs font-bold" htmlFor="batch-start-time">
                      Time
                    </label>
                    <input
                      id="batch-start-time"
                      type="time"
                      className="input mt-1"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                </div>
                <label className="mt-3 block text-xs font-bold">Posts per day</label>
                <Select
                  className="mt-1"
                  value={String(perDay)}
                  onChange={(v) => setPerDay(Number(v))}
                  options={Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                />
                <button
                  type="button"
                  className="btn-subtle mt-3 w-full"
                  disabled={pending === 0}
                  onClick={applySpread}
                >
                  Apply spread
                </button>
                {pending > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {pending} post{pending === 1 ? "" : "s"} over ~{spreadDays} day
                    {spreadDays === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="card p-5">
            {summary && (
              <p
                className={`mb-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                  summary.failed === 0
                    ? "bg-primary-soft text-primary-dark"
                    : "bg-warning-bg text-warning-ink"
                }`}
              >
                {summary.ok} scheduled
                {summary.failed > 0 && `, ${summary.failed} failed`}.{" "}
                {summary.failed === 0 && (
                  <Link href="/dashboard/calendar" className="underline">
                    See the calendar
                  </Link>
                )}
              </p>
            )}
            {error && <p className="mb-3 text-sm font-semibold text-danger">{error}</p>}
            <button
              type="button"
              className="btn-primary w-full"
              disabled={pending === 0 || activeSelection.length === 0 || running || uploading > 0}
              onClick={() => void scheduleAll()}
            >
              {running ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Scheduling…
                </>
              ) : summary?.failed ? (
                <>
                  <Icon name="refresh" size={15} /> Retry {pending} failed
                </>
              ) : (
                <>
                  Schedule {pending} post{pending === 1 ? "" : "s"}
                </>
              )}
            </button>
            {pending > 0 && activeSelection.length > 0 && !running && (
              <p className="mt-2 text-center text-xs text-muted">
                {pending} × {activeSelection.length} account
                {activeSelection.length === 1 ? "" : "s"} ={" "}
                <span className="font-semibold text-ink">
                  {pending * activeSelection.length} posts
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
