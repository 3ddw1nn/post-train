"use client";

// Shared media-library UI + upload helper, used by the Composer and the
// Content Studio wizards (extracted from composer.tsx unchanged).
import { useEffect, useState } from "react";
import { Icon } from "./icons";

export type ComposerMedia = { id: string; name: string; mime_type: string; kind: string };

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
  if (!data?.upload_url || !data?.media_id) throw new Error("The upload service returned an incomplete response. Please try again.");
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
  aspectRatio,
  onClick,
}: {
  media: ComposerMedia;
  size: number;
  full?: boolean;
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
    : "rounded-lg object-cover cursor-pointer";
  if (media.kind === "video") {
    return (
      <video
        src={url}
        className={cls}
        style={full && validAspectRatio ? { aspectRatio: validAspectRatio } : full ? undefined : { width: size, height: size }}
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
        style={full ? { height: 256 } : { width: size, height: size }}
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
      style={full ? undefined : { width: size, height: size }}
      onClick={onClick}
    />
  );
}

export function MediaLibraryModal({
  onClose,
  onPick,
  kind,
}: {
  onClose: () => void;
  onPick: (m: ComposerMedia) => void;
  kind?: string;
}) {
  const [items, setItems] = useState<ComposerMedia[] | null>(null);
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
  const visible = items?.filter((m) => !kind || m.kind === kind) ?? null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="card relative max-h-[70vh] w-full max-w-lg overflow-y-auto p-5"
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
        <p className="pr-10 font-bold">Media library</p>
        {visible === null ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {studioVideo
              ? "Nothing finished yet — finish a video in Content Studio to reuse it here."
              : "Nothing here yet — media you upload gets reusable across posts."}
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {visible.map((m) => (
              <button key={m.id} type="button" onClick={() => onPick(m)} title={m.name}>
                <MediaThumb media={m} size={100} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
