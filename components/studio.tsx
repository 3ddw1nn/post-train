"use client";

// Content Studio wizards + job list. Jobs are created via
// POST /api/app/studio/jobs and advanced by the server worker; this UI polls
// the list while any job is still running (same polling idiom as support chat).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./icons";
import { MediaLibraryModal, MediaThumb, uploadOneFile, type ComposerMedia } from "./media";

type StudioJob = {
  id: string;
  template: "grid-2x2" | "fade-in" | "ai-ugc" | "slideshow";
  status: "queued" | "generating" | "compositing" | "done" | "failed";
  output_media_id: string | null;
  output_media_ids: string | null;
  error_message: string | null;
  created_at: string;
};

type Persona = {
  id: string;
  name: string;
  preview_image_url: string | null;
  source: "stock";
};

const TEMPLATE_LABEL: Record<StudioJob["template"], string> = {
  "grid-2x2": "2x2 Grid Video",
  "fade-in": "Single Fade-in Video",
  "ai-ugc": "AI UGC Video",
  slideshow: "Slideshow",
};

const STATUS_LABEL: Record<StudioJob["status"], string> = {
  queued: "Queued",
  generating: "Generating…",
  compositing: "Rendering…",
  done: "Ready",
  failed: "Failed",
};

const SCRIPT_MAX = 600;
const CAPTION_MAX = 200;
const SLIDE_TEXT_MAX = 120;
const SLIDE_MAX = 10;

/** Mirrors estimateAiUgcCost in lib/studio.ts (speech ≈ 15 chars/second). */
function estimateSeconds(chars: number) {
  return Math.min(60, Math.max(5, Math.round(chars / 15)));
}

/* ---------------------------------- slots ---------------------------------- */

function ClipSlot({
  label,
  media,
  onChange,
  kind,
  accept,
}: {
  label: string;
  media: ComposerMedia | null;
  onChange: (m: ComposerMedia | null) => void;
  kind: "video" | "image";
  accept: string;
}) {
  const [libOpen, setLibOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setErr(null);
    setBusy(true);
    try {
      onChange(await uploadOneFile(file));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      {media ? (
        <div className="mt-2 flex items-center gap-2">
          <MediaThumb media={media} size={72} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{media.name}</p>
            <button
              type="button"
              className="mt-1 text-xs text-muted underline"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn-subtle flex-1 !py-1.5 text-sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" size={14} /> {busy ? "Uploading…" : "Upload"}
          </button>
          <button
            type="button"
            className="btn-subtle flex-1 !py-1.5 text-sm"
            disabled={busy}
            onClick={() => setLibOpen(true)}
          >
            <Icon name="image" size={14} /> Library
          </button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {libOpen && (
        <MediaLibraryModal
          kind={kind}
          onClose={() => setLibOpen(false)}
          onPick={(m) => {
            onChange(m);
            setLibOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------- caption → transparent PNG ------------------------ */

// The caption overlay is rasterized in the browser (full font/emoji support)
// and composited server-side with ffmpeg's `overlay` — slim ffmpeg builds
// don't ship drawtext/freetype.
async function captionToPngFile(text: string): Promise<File> {
  const width = 980;
  const font = "bold 64px -apple-system, 'Segoe UI', Roboto, sans-serif";
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d")!;
  ctx.font = font;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width - 40) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  const lineHeight = 80;
  canvas.width = width;
  canvas.height = Math.max(1, lines.length) * lineHeight + 24;
  ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#ffffff";
  lines.forEach((line, i) => {
    const y = 12 + i * lineHeight + lineHeight / 2;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Caption render failed"))), "image/png")
  );
  return new File([blob], "caption.png", { type: "image/png" });
}

/* --------------------------------- wizard ---------------------------------- */

export function StudioWizard({
  template,
  falPerSecond,
  aiUsed,
  aiCap,
  initialSlideTexts,
  sourceExploreItemId,
}: {
  template: StudioJob["template"];
  falPerSecond: number;
  aiUsed: number;
  aiCap: number;
  initialSlideTexts?: string[];
  sourceExploreItemId?: string;
}) {
  const router = useRouter();
  const [clips, setClips] = useState<(ComposerMedia | null)[]>(
    template === "grid-2x2" ? [null, null, null, null] : [null]
  );
  const fixedSlideCount = !!initialSlideTexts;
  const [slideImages, setSlideImages] = useState<(ComposerMedia | null)[]>(
    template === "slideshow" ? Array(initialSlideTexts?.length ?? 3).fill(null) : []
  );
  const [slideTexts, setSlideTexts] = useState<string[]>(
    template === "slideshow" ? (initialSlideTexts ?? Array(3).fill("")) : []
  );
  const [caption, setCaption] = useState("");
  const [script, setScript] = useState("");
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [personaTab, setPersonaTab] = useState<"stock" | "custom">("stock");
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [personaImage, setPersonaImage] = useState<ComposerMedia | null>(null);
  const [cta, setCta] = useState<ComposerMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (template !== "ai-ugc") return;
    fetch("/api/app/studio/personas")
      .then((r) => r.json())
      .then((d) => setPersonas(d.data ?? []))
      .catch(() => setPersonas([]));
  }, [template]);

  const mockMode = personas?.some((p) => p.id.startsWith("mock-persona")) ?? false;
  const seconds = estimateSeconds(script.length);
  const aiLeft = Math.max(0, aiCap - aiUsed);

  function addSlide() {
    if (slideImages.length >= SLIDE_MAX) return;
    setSlideImages((s) => [...s, null]);
    setSlideTexts((t) => [...t, ""]);
  }
  function removeSlide(i: number) {
    if (slideImages.length <= 1) return;
    setSlideImages((s) => s.filter((_, j) => j !== i));
    setSlideTexts((t) => t.filter((_, j) => j !== i));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { template };
      if (template === "grid-2x2" || template === "fade-in") {
        const ids = clips.filter(Boolean).map((m) => m!.id);
        if (ids.length !== clips.length) throw new Error("Add all clips first.");
        body.media_ids = ids;
        if (template === "fade-in" && caption.trim()) {
          body.caption = caption.trim();
          const png = await uploadOneFile(await captionToPngFile(caption.trim()));
          body.caption_media_id = png.id;
        }
      } else if (template === "slideshow") {
        const ids = slideImages.filter(Boolean).map((m) => m!.id);
        if (ids.length !== slideImages.length) throw new Error("Add a photo for every slide first.");
        const slides = [];
        for (let i = 0; i < slideImages.length; i++) {
          const text = slideTexts[i]?.trim() ?? "";
          const slide: Record<string, unknown> = { image_media_id: slideImages[i]!.id };
          if (text) {
            const png = await uploadOneFile(await captionToPngFile(text));
            slide.caption_media_id = png.id;
          }
          slides.push(slide);
        }
        body.slides = slides;
        if (sourceExploreItemId) body.source_explore_item_id = sourceExploreItemId;
      } else {
        body.script = script.trim();
        if (personaTab === "stock") {
          const persona = personas?.find((p) => p.id === personaId);
          if (!persona) throw new Error("Pick a persona.");
          body.persona = { source: "stock", id: persona.id, name: persona.name };
        } else {
          if (!personaImage) throw new Error("Upload a persona image.");
          body.persona = { source: "custom", image_media_id: personaImage.id };
        }
        if (cta) body.cta_media_id = cta.id;
      }
      const res = await fetch("/api/app/studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Could not start the job.");
      router.push("/dashboard/content-studio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the job.");
      setBusy(false);
    }
  }

  const ready =
    template === "ai-ugc"
      ? script.trim().length > 0 &&
        (personaTab === "stock" ? !!personaId : !!personaImage) &&
        aiLeft > 0
      : template === "slideshow"
        ? slideImages.every(Boolean)
        : clips.every(Boolean);

  return (
    <div className="fade-up">
      <div className="card mx-auto max-w-2xl p-6">
        <Link href="/dashboard/content-studio" className="text-sm text-muted hover:underline">
          ← Content Studio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{TEMPLATE_LABEL[template]}</h1>

        {template === "grid-2x2" && (
          <>
            <p className="mt-1 text-sm text-muted">
              Pick four clips — they play together in a 2x2 grid (1080x1920). Audio comes from
              the first clip.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {clips.map((m, i) => (
                <ClipSlot
                  key={i}
                  label={`Clip ${i + 1}${i === 0 ? " (audio)" : ""}`}
                  media={m}
                  kind="video"
                  accept="video/*"
                  onChange={(v) => setClips((c) => c.map((x, j) => (j === i ? v : x)))}
                />
              ))}
            </div>
          </>
        )}

        {template === "fade-in" && (
          <>
            <p className="mt-1 text-sm text-muted">
              One clip with a clean 1s fade-in and an optional caption overlay.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <ClipSlot
                label="Clip"
                media={clips[0]}
                kind="video"
                accept="video/*"
                onChange={(v) => setClips([v])}
              />
              <div>
                <label className="text-xs font-semibold text-muted">Caption (optional)</label>
                <textarea
                  className="input mt-1 w-full"
                  rows={2}
                  maxLength={CAPTION_MAX}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="POV: you found the tool that posts everywhere for you"
                />
                <p className="text-right text-xs text-muted">
                  {caption.length}/{CAPTION_MAX}
                </p>
              </div>
            </div>
          </>
        )}

        {template === "slideshow" && (
          <>
            <p className="mt-1 text-sm text-muted">
              {fixedSlideCount
                ? "Drop in your own photo for each slide — the hook text carries over from the post you started from."
                : "Add 1-10 slides, each with your own photo and optional hook text."}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {slideImages.map((m, i) => (
                <div key={i} className="rounded-xl border border-dashed border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted">Slide {i + 1}</p>
                    {!fixedSlideCount && slideImages.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-muted underline"
                        onClick={() => removeSlide(i)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-2">
                    <ClipSlot
                      label="Photo"
                      media={m}
                      kind="image"
                      accept="image/*"
                      onChange={(v) => setSlideImages((s) => s.map((x, j) => (j === i ? v : x)))}
                    />
                  </div>
                  <textarea
                    className="input mt-2 w-full"
                    rows={2}
                    maxLength={SLIDE_TEXT_MAX}
                    value={slideTexts[i] ?? ""}
                    onChange={(e) =>
                      setSlideTexts((t) => t.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    placeholder="Hook text for this slide (optional)"
                  />
                </div>
              ))}
            </div>
            {!fixedSlideCount && slideImages.length < SLIDE_MAX && (
              <button
                type="button"
                className="btn-subtle mt-3 w-full !py-1.5 text-sm"
                onClick={addSlide}
              >
                <Icon name="plus" size={14} /> Add slide
              </button>
            )}
          </>
        )}

        {template === "ai-ugc" && (
          <>
            <p className="mt-1 text-sm text-muted">
              Pick a persona, write the hook they&apos;ll say, and optionally append a CTA or
              product clip at the end.
            </p>

            <div className="mt-4 flex gap-2">
              {(
                [
                  ["stock", "Stock personas"],
                  ["custom", "Your own image"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={personaTab === tab ? "btn-primary !py-1.5 text-sm" : "btn-subtle !py-1.5 text-sm"}
                  onClick={() => setPersonaTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {personaTab === "stock" ? (
              personas === null ? (
                <p className="py-8 text-center text-sm text-muted">Loading personas…</p>
              ) : (
                <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {personas.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonaId(p.id)}
                      className={`overflow-hidden rounded-xl border-2 text-left ${
                        personaId === p.id ? "border-primary" : "border-transparent"
                      }`}
                      title={p.name}
                    >
                      {p.preview_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.preview_image_url}
                          alt={p.name}
                          className="aspect-[9/16] w-full object-cover"
                        />
                      ) : (
                        <span className="flex aspect-[9/16] items-center justify-center bg-page text-muted">
                          <Icon name="users" size={22} />
                        </span>
                      )}
                      <span className="block truncate px-1.5 py-1 text-xs">{p.name}</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="mt-3">
                <ClipSlot
                  label="Persona image (a clear face photo works best)"
                  media={personaImage}
                  kind="image"
                  accept="image/*"
                  onChange={setPersonaImage}
                />
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-semibold text-muted">Hook / script</label>
              <textarea
                className="input mt-1 w-full"
                rows={4}
                maxLength={SCRIPT_MAX}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="I tried every scheduling app so you don't have to — this one actually posts for you…"
              />
              <p className="text-right text-xs text-muted">
                {script.length}/{SCRIPT_MAX}
              </p>
            </div>

            <div className="mt-2">
              <ClipSlot
                label="CTA / product clip (optional, appended at the end)"
                media={cta}
                kind="video"
                accept="video/*"
                onChange={setCta}
              />
            </div>

            {/* Price transparency — pay-as-you-go rates, no surprises. */}
            <div className="mt-4 rounded-xl bg-page p-3 text-xs text-muted">
              {mockMode ? (
                <p>
                  <b>Demo mode</b> — no provider keys configured, so generating renders a free
                  placeholder clip through the full pipeline.
                </p>
              ) : (
                <>
                  <p>
                    Estimated video length: <b>~{seconds}s</b> for this script.
                  </p>
                  {personaTab === "custom" ? (
                    <p className="mt-1">
                      Billed to your fal.ai account (pay-as-you-go):{" "}
                      <b>≈ ${(seconds * falPerSecond).toFixed(2)}</b> at ${falPerSecond}/second
                      (Kling AI Avatar v2) + a fraction of a cent for speech synthesis.
                    </p>
                  ) : (
                    <p className="mt-1">
                      Billed to your Creatify plan:{" "}
                      <b>≈ {Math.max(5, Math.ceil(seconds / 30) * 5)} credits</b> (5 credits per
                      30 seconds of video).
                    </p>
                  )}
                </>
              )}
              <p className="mt-1">
                {aiLeft} of {aiCap} AI generations left this month.
              </p>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          className="btn-primary mt-4 w-full"
          disabled={!ready || busy}
          onClick={submit}
        >
          {busy
            ? "Starting…"
            : template === "ai-ugc"
              ? "Generate video"
              : template === "slideshow"
                ? "Render slideshow"
                : "Render video"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- jobs list -------------------------------- */

export function StudioJobsList() {
  const [jobs, setJobs] = useState<StudioJob[] | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch("/api/app/studio/jobs");
        const data = await res.json();
        if (stopped) return;
        const list: StudioJob[] = data.data ?? [];
        setJobs(list);
        if (list.some((j) => j.status !== "done" && j.status !== "failed")) {
          timer = setTimeout(load, 5000);
        }
      } catch {
        if (!stopped) timer = setTimeout(load, 10000);
      }
    }
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="font-bold">My videos</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <div key={job.id} className="card flex flex-col p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">{TEMPLATE_LABEL[job.template]}</p>
              <span
                className={`pill ${
                  job.status === "done"
                    ? "bg-green-100 text-green-700"
                    : job.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-primary-soft text-primary-dark"
                }`}
              >
                {STATUS_LABEL[job.status]}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {new Date(job.created_at).toLocaleString()}
            </p>
            {job.status === "done" && job.template === "slideshow" && job.output_media_ids && (
              <>
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {(JSON.parse(job.output_media_ids) as string[]).map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={id}
                      src={`/api/media-file/${id}`}
                      className="h-24 w-20 shrink-0 rounded-lg bg-page object-cover"
                      alt=""
                    />
                  ))}
                </div>
                <Link
                  href={`/dashboard/create/image?media=${(JSON.parse(job.output_media_ids) as string[]).join(",")}`}
                  className="btn-primary mt-3 !py-1.5 text-center text-sm"
                >
                  Create post
                </Link>
              </>
            )}
            {job.status === "done" && job.template !== "slideshow" && job.output_media_id && (
              <>
                <video
                  src={`/api/media-file/${job.output_media_id}`}
                  className="mt-3 max-h-64 w-full rounded-xl bg-page object-contain"
                  controls
                  muted
                />
                <Link
                  href={`/dashboard/create/video?media=${job.output_media_id}`}
                  className="btn-primary mt-3 !py-1.5 text-center text-sm"
                >
                  Create post
                </Link>
              </>
            )}
            {job.status === "failed" && (
              <p className="mt-2 text-xs text-red-600">{job.error_message}</p>
            )}
            {job.status !== "done" && job.status !== "failed" && (
              <p className="mt-2 text-xs text-muted">
                This usually takes a couple of minutes — the list refreshes itself.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
