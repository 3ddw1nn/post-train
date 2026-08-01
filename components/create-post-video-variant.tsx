"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { PlatformIcon } from "./platform-icon";
import { Select } from "./interactive";
import { uploadOneFile, type ComposerMedia } from "./media";
import { VIDEO_ASPECTS, VIDEO_PRESETS } from "@/lib/video-render-settings";
import { platform as platformOf } from "@/lib/platforms";

type Account = { id: number; platform: string; username: string; status: string };
type CropPosition = { x: number; y: number };
type Target = { platformId: string; aspectId: string; crop: CropPosition };

function formatsFor(platformId: string) {
  return VIDEO_PRESETS.flatMap((preset) =>
    preset.targets
      .filter((target) => target.platformId === platformId)
      .map((target) => ({ value: preset.aspect.id, label: `${preset.aspect.name} · ${preset.aspect.px}` }))
  );
}

export function VideoLibraryDestinationDialog({
  accounts,
  usedPlatforms,
  onSelect,
  onClose,
}: {
  accounts: Account[];
  usedPlatforms: string[];
  onSelect: (account: Account) => void;
  onClose: () => void;
}) {
  const destinations = accounts.filter((account) => account.status === "active");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-4" role="dialog" aria-modal="true" aria-labelledby="library-destination-title">
      <div className="card w-full max-w-xl p-5 shadow-2xl">
        <h2 id="library-destination-title" className="text-lg font-bold">Choose a destination</h2>
        <p className="mt-1 text-sm text-muted">Choose a platform first. The library will show only videos in formats that platform supports.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {destinations.map((account) => {
            const replacing = usedPlatforms.includes(account.platform);
            return (
              <button key={account.id} type="button" onClick={() => onSelect(account)} className={`group flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${replacing ? "border-primary/35 bg-primary-soft/35 hover:border-primary hover:bg-primary-soft" : "border-line bg-white hover:border-primary hover:bg-primary-soft"}`}>
                <PlatformIcon id={account.platform} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 truncate">{platformOf(account.platform)?.name ?? account.platform}{replacing && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary-deep">Video selected</span>}</span>
                  <span className="mt-0.5 block truncate text-xs font-medium text-muted">@{account.username}</span>
                  {replacing && <span className="mt-1 block text-[11px] font-semibold text-primary-deep">Choose a library video to replace it</span>}
                </span>
                <Icon name="chevronRight" size={15} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
        {usedPlatforms.length > 0 && <p className="mt-4 rounded-lg border border-primary/20 bg-primary-soft/35 px-3 py-2 text-xs font-medium text-primary-deep">Platforms marked “Video selected” already have a video. Choosing a library video replaces only that platform.</p>}
        <button type="button" className="btn-subtle mt-5" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function CropPositioner({
  source,
  target,
  formats,
  rendering,
  error,
  onChangeTarget,
  onCancel,
  onRender,
}: {
  source: ComposerMedia;
  target: Target;
  formats: { value: string; label: string }[];
  rendering: boolean;
  error: string | null;
  onChangeTarget: (next: Target) => void;
  onCancel: () => void;
  onRender: () => void;
}) {
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ clientX: number; clientY: number; position: number } | null>(null);
  const targetAspect = VIDEO_ASPECTS.find((aspect) => aspect.id === target.aspectId) ?? VIDEO_ASPECTS[0];
  const targetRatio = targetAspect.width / targetAspect.height;
  const sourceRatio = videoSize ? videoSize.width / videoSize.height : targetRatio;
  const horizontalCrop = sourceRatio > targetRatio + 0.005;
  const verticalCrop = sourceRatio < targetRatio - 0.005;
  const cropWidthPercent = horizontalCrop ? (targetRatio / sourceRatio) * 100 : 100;
  const cropHeightPercent = verticalCrop ? (sourceRatio / targetRatio) * 100 : 100;
  const cropLeftPercent = horizontalCrop ? (100 - cropWidthPercent) * target.crop.x : 0;
  const cropTopPercent = verticalCrop ? (100 - cropHeightPercent) * target.crop.y : 0;
  const canDrag = horizontalCrop || verticalCrop;
  let frameWidth = Math.min(560, 460 * sourceRatio);
  let frameHeight = frameWidth / sourceRatio;
  if (frameHeight > 460) {
    frameHeight = 460;
    frameWidth = frameHeight * sourceRatio;
  }

  function moveCrop(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !containerRef.current || !canDrag) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (horizontalCrop) {
      const travel = rect.width * (1 - cropWidthPercent / 100);
      if (travel > 0) {
        const x = Math.min(1, Math.max(0, dragStart.current.position + (event.clientX - dragStart.current.clientX) / travel));
        onChangeTarget({ ...target, crop: { ...target.crop, x } });
      }
    } else {
      const travel = rect.height * (1 - cropHeightPercent / 100);
      if (travel > 0) {
        const y = Math.min(1, Math.max(0, dragStart.current.position + (event.clientY - dragStart.current.clientY) / travel));
        onChangeTarget({ ...target, crop: { ...target.crop, y } });
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="create-post-crop-title" onClick={onCancel}>
      <div className="card w-full max-w-3xl p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="create-post-crop-title" className="text-lg font-bold">Reposition crop</h2>
            <p className="mt-1 text-sm text-muted">Choose the supported format, then drag the highlighted crop window to choose what stays visible for {platformOf(target.platformId)?.name}.</p>
          </div>
          <button type="button" aria-label="Close crop dialog" className="btn-subtle !px-3" disabled={rendering} onClick={onCancel}><Icon name="x" size={16} /></button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-bold"><PlatformIcon id={target.platformId} size={16} />{platformOf(target.platformId)?.name}</span>
          <Select
            value={target.aspectId}
            onChange={(aspectId) => onChangeTarget({ ...target, aspectId, crop: { x: 0.5, y: 0.5 } })}
            options={formats}
            width={220}
            ariaLabel="Video aspect ratio"
          />
        </div>

        <div className="mt-5 flex justify-center">
          <div ref={containerRef} className="relative touch-none select-none overflow-hidden rounded-xl bg-ink" style={{ width: frameWidth, height: frameHeight }}>
            <video src={`/api/media-file/${source.id}`} className="pointer-events-none absolute inset-0 h-full w-full" onLoadedMetadata={(event) => setVideoSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} muted autoPlay loop playsInline />
            {canDrag && (
              <div
                className="absolute border-2 border-white"
                style={{ left: `${cropLeftPercent}%`, top: `${cropTopPercent}%`, width: `${cropWidthPercent}%`, height: `${cropHeightPercent}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)", cursor: horizontalCrop ? "ew-resize" : "ns-resize" }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragStart.current = { clientX: event.clientX, clientY: event.clientY, position: horizontalCrop ? target.crop.x : target.crop.y };
                }}
                onPointerMove={moveCrop}
                onPointerUp={(event) => {
                  dragStart.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
              />
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs font-semibold text-muted">{targetAspect.name} · {targetAspect.px} · Position {Math.round(target.crop.x * 100)}% horizontal, {Math.round(target.crop.y * 100)}% vertical</p>
        {error && <p className="mt-3 text-sm font-semibold text-danger" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-subtle" disabled={rendering} onClick={() => onChangeTarget({ ...target, crop: { x: 0.5, y: 0.5 } })}><Icon name="refresh" size={14} /> Center</button>
          <button type="button" className="btn-subtle" disabled={rendering} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={rendering} onClick={onRender}>{rendering ? "Rendering…" : "Render video"}</button>
        </div>
      </div>
    </div>
  );
}

export function CreatePostVideoVariant({
  accounts,
  usedPlatforms,
  onComplete,
}: {
  accounts: Account[];
  usedPlatforms: string[];
  onComplete: (variant: { media: ComposerMedia; platformId: string; aspectRatio: string; accountId: number }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ComposerMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destinations = accounts.filter((account) => account.status === "active");
  const selectedAccount = destinations.find((account) => account.platform === target?.platformId) ?? null;
  const formats = target ? formatsFor(target.platformId) : [];

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      setSource(await uploadOneFile(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't upload this video.");
    } finally {
      setUploading(false);
    }
  }

  function choosePlatform(platformId: string) {
    const first = formatsFor(platformId)[0];
    setTarget(first ? { platformId, aspectId: first.value, crop: { x: 0.5, y: 0.5 } } : null);
  }

  async function render() {
    if (!source || !target || !selectedAccount) return;
    setRendering(true);
    setError(null);
    try {
      const started = await fetch("/api/app/studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: "fade-in",
          output_platform_id: target.platformId,
          media_ids: [source.id],
          aspect_ratio: target.aspectId,
          fade_segments: [{ media_id: source.id, crop: target.crop }],
          fade_transition: "cut",
          fade_closing: { type: "cut", duration: 0.5 },
        }),
      });
      const job = await started.json().catch(() => null);
      if (!started.ok || !job?.id) throw new Error(job?.error?.message ?? "Couldn't start the video render.");
      for (let attempts = 0; attempts < 120; attempts++) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const response = await fetch("/api/app/studio/jobs");
        const data = await response.json().catch(() => null);
        const current = data?.data?.find((entry: { id: string }) => entry.id === job.id);
        if (current?.status === "done" && current.output_media_id) {
          onComplete({ media: { id: current.output_media_id, name: source.name, mime_type: "video/mp4", kind: "video" }, platformId: target.platformId, aspectRatio: target.aspectId, accountId: selectedAccount.id });
          setSource(null);
          setTarget(null);
          return;
        }
        if (current?.status === "failed") throw new Error(current.error_message ?? "Couldn't render this video.");
      }
      throw new Error("The render is taking longer than expected. Please try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't render this video.");
    } finally {
      setRendering(false);
    }
  }

  return <>
    <button type="button" className="btn-primary !py-1.5" disabled={uploading || rendering || destinations.length === 0} onClick={() => input.current?.click()}>
      {uploading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Uploading…</> : <><Icon name="upload" size={16} /> Upload video</>}
    </button>
    <input ref={input} type="file" accept="video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
    {source && !target && (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-4" role="dialog" aria-modal="true" aria-labelledby="video-destination-title">
        <div className="card w-full max-w-xl p-5 shadow-2xl">
          <h2 id="video-destination-title" className="text-lg font-bold">Choose a destination</h2>
          <p className="mt-1 text-sm text-muted">This video will be rendered only for the selected connected platform.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {destinations.map((account) => {
              const replacing = usedPlatforms.includes(account.platform);
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => choosePlatform(account.platform)}
                  className={`group flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    replacing ? "border-primary/35 bg-primary-soft/35 hover:border-primary hover:bg-primary-soft" : "border-line bg-white hover:border-primary hover:bg-primary-soft"
                  }`}
                >
                  <PlatformIcon id={account.platform} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate">
                      {platformOf(account.platform)?.name ?? account.platform}
                      {replacing && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary-deep">Video selected</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-medium text-muted">@{account.username}</span>
                    {replacing && <span className="mt-1 block text-[11px] font-semibold text-primary-deep">Render to replace this platform&apos;s video</span>}
                  </span>
                  <Icon name="chevronRight" size={15} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
          {usedPlatforms.length > 0 && <p className="mt-4 rounded-lg border border-primary/20 bg-primary-soft/35 px-3 py-2 text-xs font-medium text-primary-deep">Platforms marked “Video selected” already have a video. Choosing one replaces only that platform after you render.</p>}
          <button type="button" className="btn-subtle mt-5" onClick={() => setSource(null)}>Cancel</button>
        </div>
      </div>
    )}
    {source && target && <CropPositioner source={source} target={target} formats={formats} rendering={rendering} error={error} onChangeTarget={setTarget} onCancel={() => { if (!rendering) { setSource(null); setTarget(null); } }} onRender={() => void render()} />}
    {!source && error && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{error}</p>}
  </>;
}
