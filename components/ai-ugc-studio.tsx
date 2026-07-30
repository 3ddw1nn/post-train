"use client";

// THESIS: AI UGC is a campaign workflow, not a one-shot generator.
// OWN-WORLD: Post Train's restrained white/teal operator UI, with destinations,
// creator imagery, and generation state doing the visual work.
// STORY: Choose the campaign and creator, write platform copy while the actor
// renders, then inspect the real post and launch it.
// FIRST VIEWPORT: Studio header, resumable drafts, or a three-stop workflow
// whose first stop contains campaign, Post To, creator, script, and CTA.
// FORM: Existing Studio wizard extension; Operate mode; no new visual world.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { AccountAvatar, PlatformIcon } from "./platform-icon";
import {
  MediaLibraryModal,
  MediaThumb,
  uploadOneFile,
  type ComposerMedia,
} from "./media";
import {
  CAPTION_MAX,
  CAPTION_MAX_BY_PLATFORM,
  platform as platformOf,
} from "@/lib/platforms";
import type { StudioDraftRow } from "@/lib/studio-drafts";
import { StudioChooseScreen, StudioCtaCard } from "./studio-choose-screen";

export type AiUgcAccount = {
  id: number;
  platform: string;
  username: string;
  avatar_url: string | null;
};

type Persona = {
  id: string;
  name: string;
  preview_image_url: string;
  source: "stock";
  is_demo?: boolean;
};

type JobStatus = "idle" | "queued" | "generating" | "compositing" | "done" | "failed";

type UgcDraftSnapshot = {
  step?: number;
  campaignName?: string;
  publishDate?: string;
  publishTime?: string;
  selectedAccountIds?: number[];
  personaTab?: "stock" | "custom";
  personaId?: string | null;
  personaImage?: ComposerMedia | null;
  script?: string;
  cta?: ComposerMedia | null;
  platformCaptions?: Record<string, string>;
  activePlatform?: string;
  captionLength?: "short" | "medium" | "long";
  jobId?: string | null;
  jobStatus?: JobStatus;
  outputMediaId?: string | null;
  generatedSignature?: string | null;
};

const STEPS = ["Create", "Captions", "Review & Launch"] as const;
const SCRIPT_MAX = 600;

function defaultPublishing() {
  const date = new Date(Date.now() + 15 * 60_000);
  return {
    date: [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-"),
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

function estimateSeconds(chars: number) {
  return Math.min(60, Math.max(5, Math.round(chars / 15)));
}

function WizardStepper({
  current,
  onNavigate,
}: {
  current: number;
  onNavigate: (step: number) => void;
}) {
  return (
    <div className="card mt-5 px-5 py-5 sm:px-6">
      <div className="flex items-center">
        {STEPS.map((label, index) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => onNavigate(index)}
              aria-current={index === current ? "step" : undefined}
              aria-label={`Step ${index + 1}: ${label}`}
              className="group flex min-h-11 min-w-11 flex-col items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black transition-colors ${
                  index < current
                    ? "border-primary bg-primary text-white"
                    : index === current
                      ? "border-primary bg-primary-soft text-primary-deep ring-4 ring-primary-soft/70"
                      : "border-line bg-white text-muted"
                }`}
              >
                {index < current ? <Icon name="check" size={17} /> : index + 1}
              </span>
              <span
                className={`hidden text-xs font-black uppercase tracking-[0.12em] sm:block ${
                  index === current
                    ? "text-primary-deep"
                    : index < current
                      ? "text-ink"
                      : "text-muted"
                }`}
              >
                {label}
              </span>
            </button>
            {index < STEPS.length - 1 && (
              <span
                className={`mx-3 mb-0 h-0.5 flex-1 sm:mx-8 sm:mb-8 ${
                  index < current ? "bg-primary" : "bg-line"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaSlot({
  label,
  hint,
  media,
  kind,
  accept,
  onChange,
}: {
  label: string;
  hint: string;
  media: ComposerMedia | null;
  kind: "video" | "image";
  accept: string;
  onChange: (media: ComposerMedia | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      onChange(await uploadOneFile(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-dashed border-line bg-page/35 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink">{label}</p>
            <p className="mt-0.5 text-xs text-muted">{hint}</p>
          </div>
          {media && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs font-semibold text-muted hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
        {media ? (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-white p-2.5">
            <MediaThumb media={media} size={62} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{media.name}</p>
              <p className="mt-0.5 text-xs text-muted">Ready to use</p>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={uploading}
              className="btn-subtle flex-1 !py-2 text-sm disabled:opacity-50"
            >
              <Icon name="upload" size={15} />
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              disabled={uploading}
              className="btn-subtle flex-1 !py-2 text-sm disabled:opacity-50"
            >
              <Icon name="image" size={15} /> Library
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        <input
          ref={input}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </div>
      {libraryOpen && (
        <MediaLibraryModal
          kind={kind}
          onClose={() => setLibraryOpen(false)}
          onPick={(picked) => {
            onChange(picked);
            setLibraryOpen(false);
          }}
        />
      )}
    </>
  );
}

function DraftPreview({ draft }: { draft: StudioDraftRow }) {
  try {
    const state = JSON.parse(draft.state) as UgcDraftSnapshot;
    if (state.personaTab === "custom" && state.personaImage) {
      return <MediaThumb media={state.personaImage} size={64} />;
    }
    const slug = state.personaId?.replace(/^stock-/, "");
    if (slug) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          src={`/ai-personas/${slug}.png`}
          alt=""
          className="h-16 w-12 shrink-0 rounded-lg object-cover"
        />
      );
    }
  } catch {
    // Invalid legacy draft: use the neutral fallback below.
  }
  return (
    <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
      <Icon name="sparkles" size={20} />
    </span>
  );
}

export function AiUgcStudio({
  accounts = [],
  avatarPerSecond,
  aiUsed,
  aiCap,
}: {
  accounts?: AiUgcAccount[];
  avatarPerSecond: number;
  aiUsed: number;
  aiCap: number;
}) {
  const router = useRouter();
  const initialPublishing = useMemo(defaultPublishing, []);
  const [mode, setMode] = useState<"choose" | "wizard">("choose");
  const [step, setStep] = useState(0);

  const [campaignName, setCampaignName] = useState("");
  const [publishDate, setPublishDate] = useState(initialPublishing.date);
  const [publishTime, setPublishTime] = useState(initialPublishing.time);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());

  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [personaTab, setPersonaTab] = useState<"stock" | "custom">("stock");
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [personaImage, setPersonaImage] = useState<ComposerMedia | null>(null);
  const [script, setScript] = useState("");
  const [cta, setCta] = useState<ComposerMedia | null>(null);

  const [platformCaptions, setPlatformCaptions] = useState<Record<string, string>>({});
  const [activePlatform, setActivePlatform] = useState("");
  const [captionLength, setCaptionLength] = useState<"short" | "medium" | "long">("medium");
  const [captionBusy, setCaptionBusy] = useState<Record<string, boolean>>({});
  const [captionError, setCaptionError] = useState<Record<string, string>>({});

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [outputMediaId, setOutputMediaId] = useState<string | null>(null);
  const [generatedSignature, setGeneratedSignature] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [startingGeneration, setStartingGeneration] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);

  const [drafts, setDrafts] = useState<StudioDraftRow[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const draftIdRef = useRef<string | undefined>(undefined);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");

  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");

  const selectedAccounts = accounts.filter((account) => selectedAccountIds.has(account.id));
  const selectedPlatforms = Array.from(new Set(selectedAccounts.map((account) => account.platform)));
  const currentPlatform = selectedPlatforms.includes(activePlatform)
    ? activePlatform
    : selectedPlatforms[0] ?? "";
  const activeAccounts = selectedAccounts.filter((account) => account.platform === currentPlatform);
  const activeCaption = platformCaptions[currentPlatform] ?? "";
  const activeCaptionMax =
    CAPTION_MAX_BY_PLATFORM[currentPlatform as keyof typeof CAPTION_MAX_BY_PLATFORM] ?? CAPTION_MAX;
  const selectedPersona = personas?.find((persona) => persona.id === personaId) ?? null;
  const aiLeft = Math.max(0, aiCap - aiUsed);
  const seconds = estimateSeconds(script.length);
  const rendering = ["queued", "generating", "compositing"].includes(jobStatus);
  const mockMode = personas?.some((persona) => persona.is_demo) ?? false;

  function generationSignature() {
    return JSON.stringify({
      persona:
        personaTab === "stock"
          ? { source: "stock", id: personaId }
          : { source: "custom", id: personaImage?.id ?? null },
      script: script.trim(),
      cta: cta?.id ?? null,
    });
  }

  const outputIsCurrent =
    !!outputMediaId && jobStatus === "done" && generatedSignature === generationSignature();
  const createReady =
    campaignName.trim().length > 0 &&
    selectedAccounts.length > 0 &&
    script.trim().length > 0 &&
    (personaTab === "stock" ? !!personaId : !!personaImage) &&
    aiLeft > 0;
  const createHint = !campaignName.trim()
    ? "Add a campaign name to continue."
    : selectedAccounts.length === 0
      ? "Choose at least one destination under Post To."
      : personaTab === "stock" && !personaId
        ? "Choose an AI creator."
        : personaTab === "custom" && !personaImage
          ? "Upload a creator image."
          : !script.trim()
            ? "Write the creator's script."
            : aiLeft <= 0
              ? "This workspace has no AI generations left this month."
              : "";

  const scheduledLabel = new Date(`${publishDate}T${publishTime || "00:00"}`).toLocaleString(
    undefined,
    { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/studio/personas")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const next = (data?.data ?? []) as Persona[];
        setPersonas(next);
      })
      .catch(() => !cancelled && setPersonas([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/studio/drafts")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) {
          setDrafts(
            ((data?.data ?? []) as StudioDraftRow[]).filter((draft) => draft.template === "ai-ugc"),
          );
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setDraftsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !jobId ||
      jobStatus === "failed" ||
      (jobStatus === "done" && outputMediaId)
    ) {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/app/studio/jobs/${jobId}`);
        const job = response.ok ? await response.json() : null;
        if (!job) {
          setPollNonce((value) => value + 1);
          return;
        }
        setJobStatus(job.status);
        if (job.status === "done") {
          setOutputMediaId(job.output_media_id ?? null);
        } else if (job.status === "failed") {
          setGenerationError(job.error_message ?? "The AI video generation failed.");
        } else {
          setPollNonce((value) => value + 1);
        }
      } catch {
        setPollNonce((value) => value + 1);
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [jobId, jobStatus, outputMediaId, pollNonce]);

  useEffect(() => {
    if (mode !== "wizard" || (!campaignName.trim() && !script.trim())) return;
    const timer = window.setTimeout(async () => {
      setDraftStatus("saving");
      const state: UgcDraftSnapshot = {
        step,
        campaignName,
        publishDate,
        publishTime,
        selectedAccountIds: [...selectedAccountIds],
        personaTab,
        personaId,
        personaImage,
        script,
        cta,
        platformCaptions,
        activePlatform,
        captionLength,
        jobId,
        jobStatus,
        outputMediaId,
        generatedSignature,
      };
      try {
        const response = await fetch("/api/app/studio/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftIdRef.current,
            template: "ai-ugc",
            mode: "custom",
            source_platform: null,
            title: campaignName || "Untitled AI UGC video",
            cover_image_url:
              personaTab === "stock" ? selectedPersona?.preview_image_url ?? null : null,
            state,
          }),
        });
        if (!response.ok) {
          setDraftStatus("idle");
          return;
        }
        const saved = (await response.json()) as StudioDraftRow;
        draftIdRef.current = saved.id;
        setDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)]);
        setDraftStatus("saved");
      } catch {
        setDraftStatus("idle");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    mode,
    step,
    campaignName,
    publishDate,
    publishTime,
    selectedAccountIds,
    personaTab,
    personaId,
    personaImage,
    script,
    cta,
    platformCaptions,
    activePlatform,
    captionLength,
    jobId,
    jobStatus,
    outputMediaId,
    generatedSignature,
    selectedPersona?.preview_image_url,
  ]);

  function resetWizard() {
    const publishing = defaultPublishing();
    setStep(0);
    setCampaignName("");
    setPublishDate(publishing.date);
    setPublishTime(publishing.time);
    setSelectedAccountIds(new Set());
    setPersonaTab("stock");
    setPersonaId(null);
    setPersonaImage(null);
    setScript("");
    setCta(null);
    setPlatformCaptions({});
    setActivePlatform("");
    setCaptionLength("medium");
    setJobId(null);
    setJobStatus("idle");
    setOutputMediaId(null);
    setGeneratedSignature(null);
    setGenerationError("");
    setLaunchError("");
    draftIdRef.current = undefined;
    setDraftStatus("idle");
  }

  function resumeDraft(draft: StudioDraftRow) {
    try {
      const state = JSON.parse(draft.state) as UgcDraftSnapshot;
      draftIdRef.current = draft.id;
      setStep(Math.max(0, Math.min(STEPS.length - 1, state.step ?? 0)));
      setCampaignName(state.campaignName ?? draft.title ?? "");
      setPublishDate(state.publishDate ?? initialPublishing.date);
      setPublishTime(state.publishTime ?? initialPublishing.time);
      const connectedAccountIds = new Set(accounts.map((account) => account.id));
      setSelectedAccountIds(
        new Set((state.selectedAccountIds ?? []).filter((id) => connectedAccountIds.has(id))),
      );
      setPersonaTab(state.personaTab ?? "stock");
      setPersonaId(state.personaId ?? null);
      setPersonaImage(state.personaImage ?? null);
      setScript(state.script ?? "");
      setCta(state.cta ?? null);
      setPlatformCaptions(state.platformCaptions ?? {});
      setActivePlatform(state.activePlatform ?? "");
      setCaptionLength(state.captionLength ?? "medium");
      setJobId(state.jobId ?? null);
      setJobStatus(state.jobStatus ?? "idle");
      setOutputMediaId(state.outputMediaId ?? null);
      setGeneratedSignature(state.generatedSignature ?? null);
      setGenerationError("");
      setLaunchError("");
      setDraftStatus("saved");
      setMode("wizard");
    } catch {
      // Ignore malformed legacy draft rows.
    }
  }

  async function deleteDraft(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
    if (draftIdRef.current === id) {
      draftIdRef.current = undefined;
      setDraftStatus("idle");
    }
    try {
      await fetch(`/api/app/studio/drafts/${id}`, { method: "DELETE" });
    } catch {
      // Best-effort cleanup.
    }
  }

  async function startGeneration() {
    if (!createReady || startingGeneration || rendering) return false;
    setStartingGeneration(true);
    setGenerationError("");
    const signature = generationSignature();
    try {
      const body: Record<string, unknown> = {
        template: "ai-ugc",
        script: script.trim(),
      };
      if (personaTab === "stock") {
        body.persona = {
          source: "stock",
          id: selectedPersona!.id,
          name: selectedPersona!.name,
        };
      } else {
        body.persona = { source: "custom", image_media_id: personaImage!.id };
      }
      if (cta) body.cta_media_id = cta.id;
      const response = await fetch("/api/app/studio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not start AI video generation.");
      }
      setJobId(data.id);
      setJobStatus(data.status ?? "queued");
      setOutputMediaId(null);
      setGeneratedSignature(signature);
      return true;
    } catch (error) {
      setJobStatus("failed");
      setGenerationError(
        error instanceof Error ? error.message : "Could not start AI video generation.",
      );
      return false;
    } finally {
      setStartingGeneration(false);
    }
  }

  async function generateCaption(platformId: string) {
    if (!platformId || captionBusy[platformId]) return;
    setCaptionBusy((current) => ({ ...current, [platformId]: true }));
    setCaptionError((current) => ({ ...current, [platformId]: "" }));
    try {
      const response = await fetch("/api/app/studio/platform-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platformId,
          context: script,
          campaignName,
          length: captionLength,
          format: "video",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.text) {
        throw new Error(data?.error?.message ?? "Could not generate a caption.");
      }
      setPlatformCaptions((current) => ({ ...current, [platformId]: data.text }));
    } catch (error) {
      setCaptionError((current) => ({
        ...current,
        [platformId]: error instanceof Error ? error.message : "Could not generate a caption.",
      }));
    } finally {
      setCaptionBusy((current) => ({ ...current, [platformId]: false }));
    }
  }

  async function goNext() {
    if (step === 0) {
      if (!createReady) return;
      if (!outputIsCurrent && !rendering) {
        const started = await startGeneration();
        if (!started) return;
      }
      setStep(1);
      return;
    }
    if (step === 1) setStep(2);
  }

  function goBack() {
    if (step === 0) setMode("choose");
    else setStep((current) => current - 1);
  }

  function goToStep(next: number) {
    if (
      next > step &&
      step === 0 &&
      (!createReady || (!rendering && !generatedSignature))
    ) {
      return;
    }
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  }

  async function launch() {
    if (!outputIsCurrent || launching || selectedAccounts.length === 0) return;
    setLaunching(true);
    setLaunchError("");
    try {
      const scheduled = new Date(`${publishDate}T${publishTime}`);
      if (Number.isNaN(scheduled.getTime())) throw new Error("Choose a valid publishing date and time.");
      const firstCaption = (
        selectedPlatforms.map((platform) => platformCaptions[platform] ?? "").find(Boolean) ?? ""
      )
        .trim()
        .slice(0, CAPTION_MAX);
      const response = await fetch("/api/app/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          caption: firstCaption,
          media: [outputMediaId],
          social_accounts: selectedAccounts.map((account) => account.id),
          scheduled_at: scheduled.toISOString(),
          account_configurations: selectedAccounts
            .map((account) => ({
              account_id: account.id,
              caption: platformCaptions[account.platform]?.trim() ?? "",
            }))
            .filter((configuration) => configuration.caption),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? "Could not schedule this post.");
      if (draftIdRef.current) {
        await fetch(`/api/app/studio/drafts/${draftIdRef.current}`, { method: "DELETE" }).catch(
          () => {},
        );
      }
      router.push("/dashboard/posts?status=scheduled");
      router.refresh();
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Could not schedule this post.");
    } finally {
      setLaunching(false);
    }
  }

  const draftStatusPill =
    mode !== "wizard" || (!campaignName.trim() && !script.trim()) ? null : (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
        {draftStatus === "saved" ? (
          <Icon name="check" size={13} className="text-primary-deep" />
        ) : (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-transparent" />
        )}
        {draftStatus === "saved" ? "Saved as draft" : "Saving draft…"}
      </span>
    );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {mode === "choose" ? (
          <Link
            href="/dashboard/content-studio"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep"
          >
            <Icon name="chevronLeft" size={15} /> Content Studio
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setMode("choose")}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary-deep"
          >
            <Icon name="chevronLeft" size={15} /> Back to start
          </button>
        )}
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <Icon name="sparkles" size={18} />
          </span>
          AI UGC Video Studio
        </h1>
      </div>
      {draftStatusPill}
    </div>
  );

  if (mode === "choose") {
    return (
      <StudioChooseScreen
        maxW="max-w-5xl"
        icon="sparkles"
        title="AI UGC Video Studio"
        headerExtra={draftStatusPill}
        cta={
          <StudioCtaCard
            title="Create an AI creator video"
            description="Choose the face, write what they say, add an optional product clip, then tailor and schedule the finished video for every destination."
            buttonLabel="New AI UGC video"
            onClick={() => { resetWizard(); setMode("wizard"); }}
          />
        }
        drafts={drafts}
        draftsLoading={draftsLoading}
        renderPreview={(draft) => <DraftPreview draft={draft} />}
        onResume={resumeDraft}
        onDelete={(id) => deleteDraft(id)}
        emptyState={
          <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-5">
            <p className="text-sm font-bold text-ink">No saved drafts yet</p>
            <p className="mt-1 text-sm text-muted">
              Your work will appear here automatically after you name a campaign or start a script.
            </p>
          </div>
        }
      />
    );
  }

  return (
    <div className="fade-up mx-auto w-full max-w-7xl pb-10">
      {header}
      <WizardStepper current={step} onNavigate={goToStep} />

      <div className="card mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="text-lg font-bold text-ink">{STEPS[step]}</h2>
          </div>
          {rendering && (
            <span className="inline-flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary-deep">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
              Generating video in the background
            </span>
          )}
        </div>

        {step === 0 && (
          <>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                  Campaign name
                </span>
                <input
                  className="input mt-2"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="Summer product demo"
                />
              </label>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                  Publishing
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="date"
                    aria-label="Publishing date"
                    value={publishDate}
                    onChange={(event) => setPublishDate(event.target.value)}
                    className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                  <input
                    type="time"
                    aria-label="Publishing time"
                    value={publishTime}
                    onChange={(event) => setPublishTime(event.target.value)}
                    className="h-[42px] rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>
            </div>

            <section className="mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Post To</p>
              {accounts.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No accounts connected yet — connect one under Connections.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      title={account.username}
                      onClick={() =>
                        setSelectedAccountIds((current) => {
                          const next = new Set(current);
                          next.has(account.id) ? next.delete(account.id) : next.add(account.id);
                          return next;
                        })
                      }
                      aria-pressed={selectedAccountIds.has(account.id)}
                      aria-label={`${selectedAccountIds.has(account.id) ? "Remove" : "Add"} ${account.username} on ${platformOf(account.platform)?.name ?? account.platform}`}
                      className="flex flex-col items-center gap-1"
                    >
                      <AccountAvatar
                        username={account.username}
                        platformId={account.platform}
                        avatarUrl={account.avatar_url}
                        selected={selectedAccountIds.has(account.id)}
                      />
                      <span className="max-w-20 truncate text-xs font-semibold text-muted">
                        {account.username}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-ink">Choose your AI creator</h3>
                    <p className="mt-1 text-sm text-muted">
                      Use an original studio creator or upload a face you have permission to animate.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPersonaTab("stock")}
                      aria-pressed={personaTab === "stock"}
                      className={personaTab === "stock" ? "btn-primary !py-1.5 text-sm" : "btn-subtle !py-1.5 text-sm"}
                    >
                      Studio creators
                    </button>
                    <button
                      type="button"
                      onClick={() => setPersonaTab("custom")}
                      aria-pressed={personaTab === "custom"}
                      className={personaTab === "custom" ? "btn-primary !py-1.5 text-sm" : "btn-subtle !py-1.5 text-sm"}
                    >
                      Your image
                    </button>
                  </div>
                </div>

                {personaTab === "stock" ? (
                  personas === null ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {Array.from({ length: 4 }, (_, index) => (
                        <span key={index} className="aspect-[9/16] animate-pulse rounded-xl bg-page" />
                      ))}
                    </div>
                  ) : personas.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
                      Studio creators could not be loaded. Refresh and try again.
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {personas.map((persona) => (
                        <button
                          key={persona.id}
                          type="button"
                          onClick={() => setPersonaId(persona.id)}
                          aria-pressed={personaId === persona.id}
                          className={`overflow-hidden rounded-xl border-2 bg-white text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            personaId === persona.id
                              ? "border-primary"
                              : "border-transparent hover:border-primary/45"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={persona.preview_image_url}
                            alt={persona.name}
                            className="aspect-[9/16] w-full object-cover"
                          />
                          <span className="flex items-center justify-between gap-2 px-2 py-2 text-sm font-bold">
                            {persona.name}
                            {personaId === persona.id && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                                <Icon name="check" size={12} />
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="mt-4">
                    <MediaSlot
                      label="Creator image"
                      hint="A clear, front-facing portrait gives the most stable result."
                      media={personaImage}
                      kind="image"
                      accept="image/*"
                      onChange={setPersonaImage}
                    />
                  </div>
                )}

                <label className="mt-6 block">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-ink">Creator script</span>
                    <span className="text-xs font-semibold text-muted">
                      {script.length}/{SCRIPT_MAX}
                    </span>
                  </span>
                  <textarea
                    className="input mt-2 min-h-36 w-full"
                    maxLength={SCRIPT_MAX}
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    placeholder="I tried every scheduling app so you don't have to—this one actually posts for you…"
                  />
                  <span className="mt-1.5 block text-xs text-muted">
                    Write for spoken delivery: short sentences, one clear hook, and a natural CTA.
                  </span>
                </label>
              </div>

              <aside className="min-w-0 xl:border-l xl:border-line xl:pl-6">
                <MediaSlot
                  label="Product or CTA clip"
                  hint="Optional. This clip is appended after the creator finishes speaking."
                  media={cta}
                  kind="video"
                  accept="video/*"
                  onChange={setCta}
                />
                <div className="mt-4 rounded-xl bg-page p-4">
                  <p className="text-sm font-bold text-ink">Generation estimate</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Video length</dt>
                      <dd className="font-bold">~{seconds}s</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Provider cost</dt>
                      <dd className="font-bold">≈ ${(seconds * avatarPerSecond).toFixed(2)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Monthly balance</dt>
                      <dd className="font-bold">
                        {aiLeft}/{aiCap}
                      </dd>
                    </div>
                  </dl>
                  {mockMode && (
                    <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-muted">
                      Demo mode is active. Configure the avatar provider to create a real video.
                    </p>
                  )}
                </div>
              </aside>
            </div>
            {generationError && (
              <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {generationError}
              </p>
            )}
          </>
        )}

        {step === 1 && (
          <div className="mt-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-ink">Platform captions</h3>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  The spoken script lives in the video. Use this space for the post copy each
                  platform receives.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted">Length</span>
                {(["short", "medium", "long"] as const).map((length) => (
                  <button
                    key={length}
                    type="button"
                    onClick={() => setCaptionLength(length)}
                    aria-pressed={captionLength === length}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold capitalize ${
                      captionLength === length
                        ? "border-primary bg-primary-soft text-primary-deep"
                        : "border-line bg-white text-muted hover:border-primary/45"
                    }`}
                  >
                    {length}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto border-b border-line">
              {selectedPlatforms.map((platformId) => (
                <button
                  key={platformId}
                  type="button"
                  onClick={() => setActivePlatform(platformId)}
                  aria-pressed={currentPlatform === platformId}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-bold ${
                    currentPlatform === platformId
                      ? "border-primary text-primary-deep"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <PlatformIcon id={platformId} size={16} />
                  {platformOf(platformId)?.name ?? platformId}
                </button>
              ))}
            </div>

            {currentPlatform && (
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="ugc-platform-caption" className="text-sm font-bold text-ink">
                      {platformOf(currentPlatform)?.name} caption
                    </label>
                    <span
                      className={`text-xs font-semibold ${
                        activeCaption.length > activeCaptionMax ? "text-red-600" : "text-muted"
                      }`}
                    >
                      {activeCaption.length}/{activeCaptionMax}
                    </span>
                  </div>
                  <textarea
                    id="ugc-platform-caption"
                    className="input mt-2 min-h-52 w-full"
                    maxLength={activeCaptionMax}
                    value={activeCaption}
                    onChange={(event) =>
                      setPlatformCaptions((current) => ({
                        ...current,
                        [currentPlatform]: event.target.value,
                      }))
                    }
                    placeholder={`Write the ${platformOf(currentPlatform)?.name ?? "platform"} caption…`}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void generateCaption(currentPlatform)}
                      disabled={captionBusy[currentPlatform]}
                      className="btn-subtle !py-1.5 text-sm disabled:opacity-50"
                    >
                      <Icon name="sparkles" size={15} />
                      {captionBusy[currentPlatform] ? "Writing…" : "Auto-fill from script"}
                    </button>
                    <span className="text-xs text-muted">Captions are optional.</span>
                  </div>
                  {captionError[currentPlatform] && (
                    <p className="mt-2 text-sm font-semibold text-red-600">
                      {captionError[currentPlatform]}
                    </p>
                  )}
                </div>
                <aside className="rounded-xl bg-page p-4">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">
                    Destinations
                  </p>
                  <div className="mt-3 space-y-3">
                    {activeAccounts.map((account) => (
                      <div key={account.id} className="flex items-center gap-3">
                        <AccountAvatar
                          username={account.username}
                          platformId={account.platform}
                          avatarUrl={account.avatar_url}
                          size={34}
                        />
                        <span className="min-w-0 truncate text-sm font-bold">{account.username}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                    This caption will be used for every selected {platformOf(currentPlatform)?.name} account.
                  </p>
                </aside>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="mt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Campaign</p>
                <h3 className="text-xl font-bold text-ink">{campaignName}</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-page px-3 py-2 text-sm font-semibold text-muted">
                <Icon name="clock" size={14} /> {scheduledLabel}
              </span>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto border-b border-line">
              {selectedPlatforms.map((platformId) => (
                <button
                  key={platformId}
                  type="button"
                  onClick={() => setActivePlatform(platformId)}
                  aria-pressed={currentPlatform === platformId}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-bold ${
                    currentPlatform === platformId
                      ? "border-primary text-primary-deep"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <PlatformIcon id={platformId} size={16} />
                  {platformOf(platformId)?.name ?? platformId}
                </button>
              ))}
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex items-center gap-3">
                  {activeAccounts[0] && (
                    <AccountAvatar
                      username={activeAccounts[0].username}
                      platformId={activeAccounts[0].platform}
                      avatarUrl={activeAccounts[0].avatar_url}
                      size={38}
                    />
                  )}
                  <div>
                    <p className="text-sm font-bold text-ink">
                      {activeAccounts[0]?.username ?? platformOf(currentPlatform)?.name}
                    </p>
                    <p className="text-xs text-muted">
                      {activeAccounts.length > 1 ? `+${activeAccounts.length - 1} more · ` : ""}
                      {platformOf(currentPlatform)?.name}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-muted">
                  AI creator · {seconds}s estimated
                </span>
              </div>

              {outputIsCurrent ? (
                <div className="bg-ink p-4">
                  <video
                    src={`/api/media-file/${outputMediaId}`}
                    className="mx-auto max-h-[62vh] w-full max-w-sm rounded-xl object-contain ring-1 ring-white/15"
                    controls
                    playsInline
                  />
                </div>
              ) : rendering ? (
                <div className="flex min-h-80 flex-col items-center justify-center bg-page/35 p-6 text-center">
                  <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary" />
                  <p className="mt-4 font-bold text-ink">Your AI creator is rendering</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    Keep this page open or come back from Drafts. The finished video will be attached automatically.
                  </p>
                </div>
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center bg-page/35 p-6 text-center">
                  <Icon name={generationError ? "warningTriangle" : "sparkles"} size={30} className="text-primary-deep" />
                  <p className="mt-3 font-bold text-ink">
                    {generationError
                      ? "The last generation did not finish"
                      : outputMediaId
                        ? "Your inputs changed"
                        : "Video generation has not started"}
                  </p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    {generationError ||
                      (outputMediaId
                        ? "Generate again so the preview matches the current creator, script, and CTA."
                        : "Generate the video before launching this campaign.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void startGeneration()}
                    disabled={!createReady || startingGeneration}
                    className="btn-primary mt-4 disabled:opacity-50"
                  >
                    <Icon name="sparkles" size={15} />
                    {startingGeneration ? "Starting…" : "Generate video"}
                  </button>
                </div>
              )}

              <div className="border-t border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-muted">
                    <Icon name="type" size={12} /> Caption
                  </p>
                  <span className="text-xs font-semibold text-muted">
                    {activeCaption.length}/{activeCaptionMax}
                  </span>
                </div>
                {activeCaption.trim() ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{activeCaption}</p>
                ) : (
                  <p className="mt-1.5 text-sm italic text-muted">No caption added.</p>
                )}
              </div>
            </div>

            <details className="group mt-4 rounded-xl border border-line bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-ink">
                <span className="flex items-center gap-1.5">
                  <Icon name="sparkles" size={14} /> Video details
                </span>
                <Icon name="chevronDown" size={16} className="text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Creator", personaTab === "stock" ? selectedPersona?.name ?? "Studio creator" : "Custom image"],
                  ["Script", `${script.length} characters`],
                  ["CTA clip", cta ? cta.name : "None"],
                  ["Destinations", `${selectedAccounts.length} account${selectedAccounts.length === 1 ? "" : "s"}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-page/60 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.1em] text-muted">{label}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-ink">{value}</p>
                  </div>
                ))}
              </div>
            </details>

            {launchError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {launchError}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          <button type="button" onClick={goBack} className="btn-subtle !py-1.5 text-sm">
            <Icon name="chevronLeft" size={15} /> Back
          </button>
          {step === 0 ? (
            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!createReady || startingGeneration}
              title={createHint || undefined}
              className="btn-primary !py-1.5 text-sm disabled:opacity-50"
            >
              {startingGeneration
                ? "Starting generation…"
                : rendering
                  ? "Continue while generating"
                  : outputIsCurrent
                    ? "Continue"
                    : "Generate & continue"}
              <Icon name="chevronRight" size={15} />
            </button>
          ) : step === 1 ? (
            <button type="button" onClick={() => void goNext()} className="btn-primary !py-1.5 text-sm">
              Review <Icon name="chevronRight" size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void launch()}
              disabled={!outputIsCurrent || launching || selectedAccounts.length === 0}
              className="btn-primary !py-1.5 text-sm disabled:opacity-50"
              title={
                selectedAccounts.length === 0
                  ? "Choose at least one connected destination."
                  : !outputIsCurrent
                    ? "Wait for the current video to finish generating."
                    : undefined
              }
            >
              {launching ? "Scheduling…" : "Launch"}
              <Icon name="send" size={15} />
            </button>
          )}
        </div>
      </div>

      {draftStatusPill && <div className="mt-4 flex justify-center">{draftStatusPill}</div>}
    </div>
  );
}
