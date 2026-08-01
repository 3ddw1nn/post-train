"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { formatBytes } from "@/lib/format";

type PreviewKind = "image" | "video" | "audio" | "pdf";

function guessKindFromName(name: string): PreviewKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return null;
}

function PreviewContent({ kind, url, name }: { kind: PreviewKind; url: string; name: string }) {
  if (kind === "video") return <video src={url} controls autoPlay className="max-h-[80vh] max-w-full rounded-lg bg-black" />;
  if (kind === "audio") return <audio src={url} controls autoPlay className="w-full min-w-[320px]" />;
  if (kind === "pdf") return <iframe src={url} title={name} className="h-[80vh] w-[80vw] rounded-lg bg-white" />;
  return <img src={url} alt={name} className="max-h-[80vh] max-w-full rounded-lg object-contain" />;
}

export function StorageFileRow({
  objectKey,
  name,
  size,
  lastModified,
  media,
}: {
  objectKey: string;
  name: string;
  size: number;
  lastModified: string | null;
  /** Known media row this object corresponds to — gives an authoritative kind and a
   *  thumbnail/preview source that doesn't need presigning (`/api/media-file/[id]`). */
  media: { id: string; kind: string } | null;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const kind: PreviewKind | null =
    media?.kind === "image" || media?.kind === "video" || media?.kind === "audio" || media?.kind === "pdf"
      ? media.kind
      : guessKindFromName(name);
  const canPreview = !!kind;
  const thumbSrc = media ? `/api/media-file/${media.id}` : null;

  async function resolveUrl(): Promise<string | null> {
    if (media) return `/api/media-file/${media.id}`;
    const res = await fetch(`/api/staff/storage/download?key=${encodeURIComponent(objectKey)}`);
    const data = await res.json().catch(() => null);
    return res.ok && data?.url ? data.url : null;
  }

  async function preview() {
    if (!kind) return;
    setLoading(true);
    try {
      const url = await resolveUrl();
      if (url) setPreviewUrl(url);
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    setLoading(true);
    try {
      const url = await resolveUrl();
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-2">
          <button
            type="button"
            className="flex items-center gap-2 text-left disabled:cursor-default"
            onClick={canPreview ? preview : undefined}
            disabled={!canPreview}
            title={canPreview ? "Preview" : undefined}
          >
            {thumbSrc && !thumbFailed ? (
              <img
                src={thumbSrc}
                alt=""
                className="h-8 w-8 rounded object-cover"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <Icon name={kind === "video" ? "video" : kind === "audio" ? "audio" : "file"} size={16} className="text-muted" />
            )}
            <span className="truncate" title={objectKey}>
              {name}
            </span>
          </button>
        </td>
        <td className="px-4 py-2">{formatBytes(size)}</td>
        <td className="px-4 py-2">{lastModified ? new Date(lastModified).toLocaleString() : "—"}</td>
        <td className="px-4 py-2 text-right">
          <div className="flex justify-end gap-1.5">
            {canPreview && (
              <button type="button" className="btn-subtle !px-2 !py-1 text-xs" onClick={preview} disabled={loading}>
                <Icon name="eye" size={13} /> Preview
              </button>
            )}
            <button type="button" className="btn-subtle !px-2 !py-1 text-xs" onClick={download} disabled={loading}>
              <Icon name="download" size={13} /> Download
            </button>
          </div>
        </td>
      </tr>

      {previewUrl && kind && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            aria-label="Close preview"
            className="absolute right-4 top-4 text-white/80 hover:text-white"
            onClick={() => setPreviewUrl(null)}
          >
            <Icon name="x" size={22} />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="flex max-w-full flex-col items-center gap-2">
            <PreviewContent kind={kind} url={previewUrl} name={name} />
            <p className="text-sm font-medium text-white/80">{name}</p>
          </div>
        </div>
      )}
    </>
  );
}
