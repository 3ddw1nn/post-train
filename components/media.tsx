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

function aspectLabel(media: ComposerMedia) {
  if (media.studio_aspect_ratio) return media.studio_aspect_ratio;
  if (!media.width || !media.height) return null;
  const ratio = media.width / media.height;
  const closest = ["9:16", "2:3", "4:5", "1:1", "16:9"].map((value) => {
    const [width, height] = value.split(":").map(Number);
    return { value, difference: Math.abs(ratio - width / height) };
  }).sort((a, b) => a.difference - b.difference)[0];
  return closest?.difference < 0.035 ? closest.value : `${media.width}:${media.height}`;
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
  const [items, setItems] = useState<ComposerMedia[] | null>(null);
  // A pick fills one slot, so the type is always concrete here — never "all".
  const [filter, setFilter] = useState<MediaFilter>({
    ...EMPTY_FILTER,
    type: kind === "video" ? "video" : "image",
  });
  // Picking a video clip means picking a *finished Content Studio video* to
  // reuse as source footage, not any random upload — Slideshow/Thumbnail
  // Maker outputs and in-progress drafts are excluded server-side.
  const studioVideo = kind === "video";
  useEffect(() => {
    setItems(null);
    fetch(studioVideo ? "/api/app/media?studio=video" : "/api/app/media")
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []));
  }, [studioVideo]);
  // In video mode the type is locked, so only that one tab is offered — which
  // renders no toggle at all, matching the old showPhotoTab behavior.
  const typeOptions: MediaTypeFilter[] = kind === "video" ? ["video"] : PICK_ONE_TYPES;
  const visible = useMemo(() => {
    if (items === null) return null;
    // Aspect filtering is this modal's own constraint (a destination only
    // accepts certain ratios) and stays on top of the shared filter.
    return applyMediaFilter(items, filter).filter((media) => {
      if (media.kind !== "video" || !allowedAspectRatios?.length) return true;
      return !!aspectLabel(media) && allowedAspectRatios.includes(aspectLabel(media)!);
    });
  }, [allowedAspectRatios, items, filter]);
  const counts = useMemo(() => facetCounts(items ?? [], filter), [items, filter]);
  const platforms = useMemo(() => platformsPresent(items ?? []), [items]);
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
        <div className="flex flex-wrap items-center justify-between gap-3 pr-12">
          <p className="font-bold">Media library</p>
          <MediaFilterBar
            filter={filter}
            onChange={setFilter}
            counts={counts}
            platforms={platforms}
            typeOptions={typeOptions}
          />
        </div>
        {allowedAspectRatios?.length ? <p className="mt-2 text-xs font-medium text-muted">Showing videos supported by the selected platform: {allowedAspectRatios.join(", ")}.</p> : null}
        {visible === null ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {studioVideo
              ? "Nothing finished yet — finish a video in Content Studio to reuse it here."
              : "Nothing here yet — media you upload gets reusable across posts."}
          </p>
        ) : (
          <div className="mt-4 grid min-h-0 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((m) => (
              <MediaLibraryItem key={m.id} media={m} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaLibraryItem({ media, onPick }: { media: ComposerMedia; onPick: (media: ComposerMedia) => void }) {
  // Finished Studio outputs retain every platform selected at Finish. Older
  // one-platform outputs use the original per-file field, so include it too.
  const formattedPlatformIds = platformIdsFor(media);
  const formattedPlatformNames = formattedPlatformIds
    .map((id) => platformOf(id)?.name ?? id)
    .join(", ");

  return (
    <button type="button" onClick={() => onPick(media)} title={media.name} className="group overflow-hidden rounded-xl border border-line bg-white text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <div className="relative grid aspect-square place-items-center overflow-hidden bg-ink">
        <MediaThumb media={media} size={220} fill />
        {aspectLabel(media) && <span className="absolute bottom-2 left-2 rounded-md bg-ink/85 px-1.5 py-1 text-[11px] font-bold text-white shadow-sm">{aspectLabel(media)}</span>}
      </div>
      <span className="flex min-w-0 items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-muted">
        <span className="shrink-0">Last formatted for</span>
        {formattedPlatformIds.length > 0 ? (
          <span className="min-w-0" aria-label={`Last formatted for ${formattedPlatformNames}`}>
            <PlatformIconRow ids={formattedPlatformIds} size={15} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
