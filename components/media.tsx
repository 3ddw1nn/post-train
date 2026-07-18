"use client";

// Shared media-library UI + upload helper, used by the Composer and the
// Content Studio wizards (extracted from composer.tsx unchanged).
import { useEffect, useState } from "react";
import { Icon } from "./icons";

export type ComposerMedia = { id: string; name: string; mime_type: string; kind: string };

/** Presigned three-step upload (create-url → PUT → complete); returns the media row. */
export async function uploadOneFile(file: File): Promise<ComposerMedia> {
  const res = await fetch("/api/app/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      name: file.name,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
  const put = await fetch(data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error("Upload failed");
  if (data.complete_url) {
    const complete = await fetch(data.complete_url, { method: "POST" });
    if (!complete.ok) throw new Error("Upload completion failed");
  }
  return {
    id: data.media_id,
    name: file.name,
    mime_type: file.type,
    kind: file.type.startsWith("video/")
      ? "video"
      : file.type === "application/pdf"
        ? "pdf"
        : "image",
  };
}

export function MediaThumb({
  media,
  size,
  full,
  onClick,
}: {
  media: ComposerMedia;
  size: number;
  full?: boolean;
  onClick?: () => void;
}) {
  const url = `/api/media-file/${media.id}`;
  const cls = full
    ? "h-64 w-full rounded-xl object-contain bg-page"
    : "rounded-lg object-cover cursor-pointer";
  if (media.kind === "video") {
    return (
      <video
        src={url}
        className={cls}
        style={full ? undefined : { width: size, height: size }}
        onClick={onClick}
        controls={full}
        muted
      />
    );
  }
  if (media.kind === "pdf") {
    return (
      <span
        className={`flex items-center justify-center bg-page text-muted ${cls}`}
        style={full ? { height: 256 } : { width: size, height: size }}
        onClick={onClick}
      >
        <Icon name="file" size={full ? 40 : 22} />
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
  useEffect(() => {
    fetch("/api/app/media")
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []));
  }, []);
  const visible = items?.filter((m) => !kind || m.kind === kind) ?? null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[70vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-bold">Media library</p>
        {visible === null ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Nothing here yet — media you upload gets reusable across posts.
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
