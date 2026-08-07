"use client";

// Shared media-library UI + upload helper, used by the Composer and the
// Content Studio wizards (extracted from composer.tsx unchanged).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { PlatformIconRow } from "./platform-icon";
import { MediaFilterBar, PICK_ONE_TYPES } from "./media-filter-bar";
import {
  EMPTY_FILTER,
  applyMediaFilter,
  facetCounts,
  platformIdsFor,
  platformsPresent,
  type MediaFilter,
  type MediaTypeFilter,
} from "@/lib/media-filters";
import { byOrigin, sourceLabel, sourceDateLabel, type Origin } from "@/lib/media-source";
import { nearestAspectId } from "@/lib/platform-aspect";
import { platform as platformOf } from "@/lib/platforms";

export type ComposerMedia = {
  id: string;
  name: string;
  mime_type: string;
  kind: string;
  width?: number | null;
  height?: number | null;
  studio_aspect_ratio?: string | null;
  studio_platform_id?: string | null;
  studio_platform_ids?: string[];
};

/** The badge on a Library card. Shares nearestAspectId with the scheduler's
 *  aspect warnings, so a card badged "9:16" can never be flagged as not 9:16. */
function aspectLabel(media: ComposerMedia) {
  if (media.studio_aspect_ratio) return media.studio_aspect_ratio;
  if (!media.width || !media.height) return null;
  return nearestAspectId(media.width, media.height) ?? `${media.width}:${media.height}`;
}

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  "3g2": "video/3gpp2",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  flv: "video/x-flv",
  m2ts: "video/mp2t",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  mpe: "video/mpeg",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  mts: "video/mp2t",
  ogv: "video/ogg",
  ts: "video/mp2t",
  webm: "video/webm",
  wmv: "video/x-ms-wmv",
};
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};
const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
};

function uploadMimeType(file: File) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_MIME_BY_EXTENSION[extension] ?? AUDIO_MIME_BY_EXTENSION[extension] ?? IMAGE_MIME_BY_EXTENSION[extension] ?? file.type ?? "application/octet-stream";
}

async function uploadError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? body?.message ?? fallback;
}

/** Uploads a file and returns the media row once the server has saved it. */
export async function uploadOneFile(file: File): Promise<ComposerMedia> {
  const mimeType = uploadMimeType(file);
  let res: Response;
  try {
    res = await fetch("/api/app/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mime_type: mimeType,
        size_bytes: file.size,
        name: file.name,
      }),
    });
  } catch {
    throw new Error("Couldn't start the upload. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't prepare this upload. Please try again.");
  if (!data?.upload_url || !data?.complete_url || !data?.media_id) {
    throw new Error("The upload service returned an incomplete response. Please try again.");
  }
  let put: Response;
  try {
    put = await fetch(data.upload_url, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: file,
    });
  } catch {
    throw new Error("Couldn't upload this file. Check your connection and try again.");
  }
  if (!put.ok) throw new Error(await uploadError(put, "Couldn't upload this file. Please try again."));
  let complete: Response;
  try {
    complete = await fetch(data.complete_url, { method: "POST" });
  } catch {
    throw new Error("The file uploaded, but we couldn't finish saving it. Please try again.");
  }
  if (!complete.ok) {
    throw new Error(await uploadError(complete, "The file uploaded, but we couldn't finish saving it. Please try again."));
  }
  return {
    id: data.media_id,
    name: file.name,
    mime_type: mimeType,
    kind: mimeType.startsWith("video/")
      ? "video"
      : mimeType.startsWith("audio/")
        ? "audio"
      : mimeType === "application/pdf"
        ? "pdf"
        : "image",
  };
}

export function MediaThumb({
  media,
  size,
  full,
  fill,
  aspectRatio,
  onClick,
}: {
  media: ComposerMedia;
  size: number;
  full?: boolean;
  /** Fill the parent preview stage (used by media-library cards). */
  fill?: boolean;
  /** A known Studio output ratio (e.g. "9:16") sizes the preview frame to the actual render. */
  aspectRatio?: string;
  onClick?: () => void;
}) {
  const url = `/api/media-file/${media.id}`;
  const validAspectRatio = aspectRatio && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(aspectRatio)
    ? aspectRatio.replace(":", " / ")
    : undefined;
  const cls = full
    ? media.kind === "video"
      ? "h-auto w-full rounded-xl bg-black object-contain"
      : "h-64 w-full rounded-xl object-contain bg-page"
    : fill
      ? "h-full w-full object-cover"
      : "rounded-lg object-cover cursor-pointer";
  if (media.kind === "video") {
    return (
      <video
        src={url}
        className={cls}
        style={full && validAspectRatio ? { aspectRatio: validAspectRatio } : full || fill ? undefined : { width: size, height: size }}
        onClick={onClick}
        controls={full}
        muted
      />
    );
  }
  if (media.kind === "pdf" || media.kind === "audio") {
    return (
      <span
        className={`flex items-center justify-center bg-page text-muted ${cls}`}
        style={full ? { height: 256 } : fill ? undefined : { width: size, height: size }}
        onClick={onClick}
      >
        <Icon name={media.kind === "audio" ? "audio" : "file"} size={full ? 40 : 22} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={media.name}
      className={cls}
      style={full || fill ? undefined : { width: size, height: size }}
      onClick={onClick}
    />
  );
}

/** Library media as this modal sees it. `/api/app/media` returns full media
 *  rows, so these fields are already on the wire — ComposerMedia just doesn't
 *  declare them (same as the Batch Scheduler's own LibraryMedia). */
type LibraryPickMedia = ComposerMedia & {
  studio_finished_at?: string | null;
  studio_template?: string | null;
  created_at?: string;
  in_draft?: boolean;
};

export function MediaLibraryModal({
  onClose,
  onPick,
  kind,
  allowedAspectRatios,
}: {
  onClose: () => void;
  onPick: (m: ComposerMedia) => void;
  kind?: string;
  allowedAspectRatios?: string[];
}) {
  const [items, setItems] = useState<LibraryPickMedia[] | null>(null);
  // A pick fills one slot, so the type is always concrete here — never "all".
  const [filter, setFilter] = useState<MediaFilter>({
    ...EMPTY_FILTER,
    type: kind === "video" ? "video" : "image",
  });
  const [origin, setOrigin] = useState<Origin>("all");
  // Picking a video clip means picking a *finished Content Studio video* to
  // reuse as source footage, not any random upload — Slideshow/Thumbnail
  // Maker outputs and in-progress drafts are excluded server-side, which
  // makes an Origin tab meaningless here — everything returned already is
  // "Finished".
  const studioVideo = kind === "video";
  useEffect(() => {
    setItems(null);
    fetch(studioVideo ? "/api/app/media?studio=video" : "/api/app/media")
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []));
  }, [studioVideo]);
  // A locked kind offers only that one tab, which renders no toggle at all,
  // matching the old showPhotoTab behavior.
  const typeOptions: MediaTypeFilter[] = kind === "video" ? ["video"] : kind === "image" ? ["image"] : PICK_ONE_TYPES;
  const inOrigin = useMemo(() => (studioVideo || items === null ? (items ?? []) : byOrigin(items, origin)), [items, origin, studioVideo]);
  const visible = useMemo(() => {
    if (items === null) return null;
    // Aspect filtering is this modal's own constraint (a destination only
    // accepts certain ratios) and stays on top of the shared filter.
    return applyMediaFilter(inOrigin, filter).filter((media) => {
      if (media.kind !== "video" || !allowedAspectRatios?.length) return true;
      return !!aspectLabel(media) && allowedAspectRatios.includes(aspectLabel(media)!);
    });
  }, [allowedAspectRatios, inOrigin, items, filter]);
  const counts = useMemo(() => facetCounts(inOrigin, filter), [inOrigin, filter]);
  const platforms = useMemo(() => platformsPresent(inOrigin), [inOrigin]);
  const originCounts: Record<Origin, number> = {
    all: items?.length ?? 0,
    finished: byOrigin(items ?? [], "finished").length,
    uploads: byOrigin(items ?? [], "uploads").length,
  };
  // Files tied up in an unfinished Studio project. Pickable, but worth saying
  // out loud so grabbing a half-done render isn't a surprise.
  const inDraftCount = byOrigin(items ?? [], "uploads").filter((m) => m.in_draft).length;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="card relative flex max-h-[82vh] w-full max-w-5xl flex-col overflow-hidden p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-subtle absolute right-3 top-3 !px-2.5 !py-2.5"
        >
          <Icon name="x" size={16} />
        </button>
        <p className="pr-12 font-bold">Media library</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!studioVideo && (
            <div
              className="flex items-center gap-1 rounded-lg border border-line bg-white p-1"
              role="tablist"
              aria-label="Content source"
            >
              {(
                [
                  { key: "all", label: "All", icon: "stack" },
                  { key: "finished", label: "Finished", icon: "check" },
                  { key: "uploads", label: "Uploads", icon: "upload" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={origin === t.key}
                  onClick={() => setOrigin(t.key)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    origin === t.key ? "bg-primary-soft text-primary-deep" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon name={t.icon} size={13} /> {t.label}
                  <span className="font-semibold opacity-70">{originCounts[t.key]}</span>
                </button>
              ))}
            </div>
          )}
          <MediaFilterBar
            filter={filter}
            onChange={setFilter}
            counts={counts}
            platforms={platforms}
            typeOptions={typeOptions}
          />
        </div>
        {allowedAspectRatios?.length ? <p className="mt-2 text-xs font-medium text-muted">Showing videos supported by the selected platform: {allowedAspectRatios.join(", ")}.</p> : null}
        {origin !== "finished" && inDraftCount > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Icon name="info" size={12} />
            {inDraftCount} file{inDraftCount === 1 ? " is" : "s are"} still in use by an unfinished
            Content Studio project.
          </p>
        )}
        {visible === null ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {studioVideo
              ? "Nothing finished yet — finish a video in Content Studio to reuse it here."
              : items?.length
                ? "Nothing matches those filters."
                : "Nothing here yet — media you upload gets reusable across posts."}
          </p>
        ) : (
          <div className="mt-4 grid min-h-0 grid-cols-3 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-5">
            {visible.map((m) => (
              <MediaLibraryItem key={m.id} media={m} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaLibraryItem({ media, onPick }: { media: LibraryPickMedia; onPick: (media: ComposerMedia) => void }) {
  // Finished Studio outputs retain every platform selected at Finish. Older
  // one-platform outputs use the original per-file field, so include it too.
  const formattedPlatformIds = platformIdsFor(media);
  const formattedPlatformNames = formattedPlatformIds
    .map((id) => platformOf(id)?.name ?? id)
    .join(", ");
  const source = sourceLabel(media);
  const sourceDate = sourceDateLabel(media);

  return (
    <button type="button" onClick={() => onPick(media)} title={media.name} className="group relative overflow-hidden rounded-lg border border-line bg-white text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span className="relative grid aspect-square place-items-center overflow-hidden bg-ink">
        <MediaThumb media={media} size={220} fill />
        {/* Square crop makes a 9:16 video and a photo look alike in the All
            view — the badge is what tells them apart without filtering. */}
        {media.kind === "video" && (
          <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-ink/75 text-white">
            <Icon name="video" size={11} />
          </span>
        )}
        {aspectLabel(media) && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-ink/85 px-1.5 py-1 text-[11px] font-bold text-white shadow-sm">{aspectLabel(media)}</span>}
        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-primary-deep opacity-0 shadow transition-opacity group-hover:opacity-100">
          <Icon name="plus" size={13} strokeWidth={3} />
        </span>
      </span>
      {/* The footer is deliberately reserved for the provenance people need
          while picking: which Studio created an asset (or Upload), and the
          relevant source date. Platform dots stay as a compact secondary cue
          for Studio exports. */}
      <span className="flex min-h-12 flex-col justify-center gap-0.5 bg-white px-2.5 py-1.5">
        <span className="flex min-w-0 items-center gap-1 text-[11px] font-bold leading-4 text-ink">
          <Icon name={source.icon} size={11} />
          <span className="truncate">{source.label}</span>
          {formattedPlatformIds.length > 0 && (
            <span className="ml-auto shrink-0" aria-label={`Last formatted for ${formattedPlatformNames}`}>
              <PlatformIconRow ids={formattedPlatformIds} size={12} />
            </span>
          )}
        </span>
        {sourceDate && (
          <span className="truncate text-[10px] font-semibold leading-3.5 text-muted" title={sourceDate.title}>
            {sourceDate.label} {sourceDate.date}
          </span>
        )}
      </span>
    </button>
  );
}
