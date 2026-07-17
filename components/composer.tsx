"use client";

// Composer per spec 03 D2: account multi-select row, media strip + dropzone
// (click / drag / paste / Import), 2200-char caption, Platform Captions & Past
// Captions expanders, per-platform config pills, Media Preview rail, Schedule
// card, and Update/Duplicate/Delete in edit mode.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { AccountAvatar } from "./platform-icon";
import { InfoTip } from "./ui";
import { platform as platformOf, FOUR_IMAGE_PLATFORMS, CAPTION_MAX, type PostType } from "@/lib/platforms";

export type ComposerAccount = {
  id: number;
  platform: string;
  username: string;
  status: string;
};
export type ComposerMedia = { id: string; name: string; mime_type: string; kind: string };
export type ComposerPost = {
  id: string;
  caption: string;
  status: string;
  is_draft: boolean;
  scheduled_at: string | null;
  social_accounts: number[];
  platform_configurations: Record<string, Record<string, unknown>>;
  account_configurations: { account_id: number; caption?: string }[];
};

const TYPE_LABEL: Record<PostType, string> = {
  text: "text post",
  image: "image post",
  video: "video post",
  story: "story post",
};

const ACCEPT: Record<PostType, string> = {
  text: "",
  image: "image/*,application/pdf",
  video: "video/*",
  story: "image/*,video/*",
};

const CONFIG_PLATFORMS = ["tiktok", "instagram", "youtube", "pinterest"] as const;

export function Composer({
  type,
  mode,
  accounts,
  pastCaptions,
  pref24h,
  prefFilenameCaption,
  entitled,
  freeRemaining,
  post,
  initialMedia,
  initialDate,
}: {
  type: PostType;
  mode: "create" | "edit";
  accounts: ComposerAccount[];
  pastCaptions: string[];
  pref24h: boolean;
  prefFilenameCaption: boolean;
  entitled: boolean;
  freeRemaining: number;
  post: ComposerPost | null;
  initialMedia: ComposerMedia[];
  initialDate?: string;
}) {
  const router = useRouter();
  const eligible = useMemo(
    () => accounts.filter((a) => platformOf(a.platform)?.supports.includes(type)),
    [accounts, type]
  );

  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(post?.social_accounts ?? [])
  );
  const [remember, setRemember] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [media, setMedia] = useState<ComposerMedia[]>(initialMedia);
  const [uploading, setUploading] = useState(0);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [expander, setExpander] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, unknown>>>(
    post?.platform_configurations ?? {}
  );
  const [accountCaptions, setAccountCaptions] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (post?.account_configurations ?? [])
        .filter((c) => c.caption)
        .map((c) => [c.account_id, c.caption as string])
    )
  );
  const initialSchedule = post?.scheduled_at ? new Date(post.scheduled_at) : null;
  const [scheduleOn, setScheduleOn] = useState(!!initialSchedule || !!initialDate);
  const [date, setDate] = useState(
    initialSchedule ? toDateInput(initialSchedule) : (initialDate ?? "")
  );
  const [time, setTime] = useState(
    initialSchedule ? toTimeInput(initialSchedule) : initialDate ? "12:00" : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const rememberKey = `pt_remember_accounts_${type}`;
  useEffect(() => {
    if (mode !== "create") return;
    try {
      const saved = localStorage.getItem(rememberKey);
      if (saved) {
        const ids = JSON.parse(saved) as number[];
        setSelected(new Set(ids.filter((id) => eligible.some((a) => a.id === id))));
        setRemember(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!remember) {
      localStorage.removeItem(rememberKey);
    } else {
      localStorage.setItem(rememberKey, JSON.stringify([...selected]));
    }
  }, [remember, selected, rememberKey]);

  const selectedPlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const a of eligible) if (selected.has(a.id)) set.add(a.platform);
    return set;
  }, [selected, eligible]);

  const filteredAccounts = eligible.filter(
    (a) =>
      !search ||
      a.username.toLowerCase().includes(search.toLowerCase()) ||
      a.platform.includes(search.toLowerCase())
  );

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      setUploading((u) => u + 1);
      try {
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
        setMedia((m) => [
          ...m,
          {
            id: data.media_id,
            name: file.name,
            mime_type: file.type,
            kind: file.type.startsWith("video/")
              ? "video"
              : file.type === "application/pdf"
                ? "pdf"
                : "image",
          },
        ]);
        if (prefFilenameCaption && !caption) {
          setCaption(file.name.replace(/\.[^.]+$/, ""));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((u) => u - 1);
      }
    }
  }

  function buildPayload(extra: Record<string, unknown>) {
    const platformConfigs: Record<string, Record<string, unknown>> = {};
    for (const p of selectedPlatforms) {
      const merged = { ...(configs[p] ?? {}) };
      const clean = Object.fromEntries(
        Object.entries(merged).filter(([, v]) => v !== "" && v !== undefined && v !== null && v !== false)
      );
      if (Object.keys(clean).length) platformConfigs[p] = clean;
    }
    return {
      type,
      caption,
      media: media.map((m) => m.id),
      social_accounts: [...selected],
      platform_configurations: platformConfigs,
      account_configurations: Object.entries(accountCaptions)
        .filter(([, c]) => c.trim())
        .map(([id, c]) => ({ account_id: Number(id), caption: c })),
      ...extra,
    };
  }

  function scheduledIso(): string | null {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  async function submit(extra: Record<string, unknown>, successPath: string) {
    setBusy(true);
    setError(null);
    try {
      const isEdit = mode === "edit";
      const res = await fetch(isEdit ? `/api/app/posts/${post!.id}` : "/api/app/posts", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(extra)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Something went wrong.");
        return;
      }
      router.push(successPath);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const editable = mode === "create" || ["draft", "scheduled"].includes(post?.status ?? "");
  const showFourImageWarning =
    media.filter((m) => m.kind !== "video").length > 4 &&
    FOUR_IMAGE_PLATFORMS.some((p) => selectedPlatforms.has(p));

  const timeCaption = (() => {
    const iso = scheduledIso();
    if (!iso) return null;
    const d = new Date(iso);
    const t = d.toLocaleTimeString([], {
      hour: pref24h ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: !pref24h,
    });
    return `Your post will be posted at ${t} in your local time.`;
  })();

  return (
    <div className="fade-up grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* ── Main column ─────────────────────────────────────── */}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">
          {mode === "edit" ? `Edit your ${TYPE_LABEL[type]}` : `Create ${TYPE_LABEL[type]}`}
        </h1>
        {!entitled && (
          <p className="mt-1 text-xs font-semibold text-warning-ink">
            Free tier: each selected account uses 1 of your {freeRemaining} remaining free
            posts.
          </p>
        )}

        {/* Account selector */}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
            onClick={() => setShowSearch((v) => !v)}
          >
            Search &amp; Filter <Icon name="chevronDown" size={14} />
          </button>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            Remember
            <button
              type="button"
              role="switch"
              aria-checked={remember}
              className="pt-toggle scale-90"
              data-on={remember}
              onClick={() => setRemember((v) => !v)}
            >
              <span />
            </button>
          </label>
        </div>
        {showSearch && (
          <input
            className="input mt-2"
            placeholder="Filter accounts by handle or platform…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {filteredAccounts.length === 0 && (
            <p className="text-sm text-muted">
              No {type}-capable accounts connected yet — add some under Connections.
            </p>
          )}
          {filteredAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              title={`@${a.username} · ${platformOf(a.platform)?.name}${a.status !== "active" ? " (needs re-auth)" : ""}`}
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(a.id)) next.delete(a.id);
                  else next.add(a.id);
                  return next;
                })
              }
              className="shrink-0"
              disabled={!editable}
            >
              <AccountAvatar
                username={a.username}
                platformId={a.platform}
                size={44}
                selected={selected.has(a.id)}
              />
            </button>
          ))}
        </div>

        {/* Media */}
        {type !== "text" && (
          <div className="mt-4">
            {media.length > 0 && (
              <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
                {media.map((m, i) => (
                  <div key={m.id} className="group relative shrink-0">
                    <MediaThumb media={m} size={72} onClick={() => setPreviewIdx(i)} />
                    {editable && (
                      <button
                        type="button"
                        aria-label={`Remove ${m.name}`}
                        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-ink text-white group-hover:flex"
                        onClick={() => {
                          setMedia((list) => list.filter((x) => x.id !== m.id));
                          setPreviewIdx(0);
                        }}
                      >
                        <Icon name="x" size={11} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                ))}
                {editable && (
                  <button
                    type="button"
                    className="btn-primary shrink-0 !py-1.5"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Icon name="plus" size={14} /> Add More
                  </button>
                )}
              </div>
            )}
            {editable && (
              <div
                className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-white p-6 text-center transition-colors hover:border-primary"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  uploadFiles(e.dataTransfer.files);
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) uploadFiles(e.clipboardData.files);
                }}
                tabIndex={0}
                role="button"
                aria-label="Upload media"
              >
                <Icon name="upload" size={22} className="text-muted" />
                <p className="text-sm font-semibold">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted">
                  …or hover and paste from your clipboard —{" "}
                  {type === "video"
                    ? "Video"
                    : type === "story"
                      ? "Image or video"
                      : "Image(s) or PDF"}{" "}
                  <InfoTip
                    text={
                      type === "image"
                        ? "PDFs are attached as a document in this build; production rasterizes each page to an image."
                        : "Max 250MB per file."
                    }
                  />
                </p>
                <button
                  type="button"
                  className="btn-primary mt-1 !py-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLibraryOpen(true);
                  }}
                >
                  Import
                </button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple={type !== "video"}
              accept={ACCEPT[type]}
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Caption */}
        <div className="mt-5">
          <label className="flex items-center gap-1.5 text-sm font-bold">
            Main Caption{" "}
            <InfoTip text="Used for every platform unless you set a platform or account override below." />
          </label>
          <div className="relative mt-2">
            <textarea
              className="input h-40 resize-y pr-2"
              placeholder="Write once, post everywhere…"
              value={caption}
              maxLength={CAPTION_MAX}
              onChange={(e) => setCaption(e.target.value)}
              onPaste={(e) => {
                if (e.clipboardData.files.length && type !== "text") {
                  e.preventDefault();
                  uploadFiles(e.clipboardData.files);
                }
              }}
              disabled={!editable}
            />
            <span className="absolute bottom-2 right-3 text-xs text-muted">
              {caption.length}/{CAPTION_MAX}
            </span>
          </div>
          {uploading > 0 && (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-primary-deep">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Sending to server… don&apos;t close this window while media uploads.
            </p>
          )}
        </div>

        {/* Post configurations & tools */}
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Post configurations &amp; tools
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ConfigPill
              label="Platform Captions"
              active={expander === "platform_captions"}
              configured={Object.values(configs).some((c) => !!c.caption)}
              onClick={() =>
                setExpander((e) => (e === "platform_captions" ? null : "platform_captions"))
              }
            />
            <ConfigPill
              label="Past Captions"
              active={expander === "past_captions"}
              onClick={() => setExpander((e) => (e === "past_captions" ? null : "past_captions"))}
            />
            {CONFIG_PLATFORMS.filter((p) => selectedPlatforms.has(p)).map((p) => (
              <ConfigPill
                key={p}
                label={`${platformOf(p)?.name} Config`}
                active={expander === `config:${p}`}
                configured={Object.entries(configs[p] ?? {}).some(
                  ([k, v]) => k !== "caption" && v !== "" && v !== false && v != null
                )}
                onClick={() => setExpander((e) => (e === `config:${p}` ? null : `config:${p}`))}
              />
            ))}
          </div>

          {expander === "platform_captions" && (
            <div className="card mt-3 flex flex-col gap-3 p-4">
              {[...selectedPlatforms].map((p) => (
                <div key={p}>
                  <label className="text-xs font-bold">{platformOf(p)?.name} caption</label>
                  <textarea
                    className="input mt-1 h-20 resize-y"
                    placeholder={`Override the main caption for ${platformOf(p)?.name}${p === "twitter" ? " (280 chars recommended)" : ""}`}
                    value={(configs[p]?.caption as string) ?? ""}
                    onChange={(e) =>
                      setConfigs((c) => ({
                        ...c,
                        [p]: { ...(c[p] ?? {}), caption: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
              {selectedPlatforms.size === 0 && (
                <p className="text-sm text-muted">Select accounts to override captions per platform.</p>
              )}
            </div>
          )}

          {expander === "past_captions" && (
            <div className="card mt-3 flex flex-col gap-1.5 p-4">
              {pastCaptions.length === 0 && (
                <p className="text-sm text-muted">Captions you&apos;ve used before will show up here.</p>
              )}
              {pastCaptions.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className="truncate rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-page"
                  onClick={() => setCaption(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {expander?.startsWith("config:") && (
            <PlatformConfigPanel
              platformId={expander.slice(7)}
              value={configs[expander.slice(7)] ?? {}}
              onChange={(v) => setConfigs((c) => ({ ...c, [expander.slice(7)]: v }))}
            />
          )}
        </div>

        {/* Account caption overrides */}
        {selected.size > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-muted hover:text-ink">
              Per-account caption overrides
            </summary>
            <div className="card mt-2 flex flex-col gap-3 p-4">
              {eligible
                .filter((a) => selected.has(a.id))
                .map((a) => (
                  <div key={a.id} className="flex items-start gap-3">
                    <AccountAvatar username={a.username} platformId={a.platform} size={32} />
                    <textarea
                      className="input h-16 resize-y"
                      placeholder={`Override for @${a.username}`}
                      value={accountCaptions[a.id] ?? ""}
                      onChange={(e) =>
                        setAccountCaptions((m) => ({ ...m, [a.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
            </div>
          </details>
        )}
        {error && <p className="mt-4 text-sm font-semibold text-danger">{error}</p>}
      </div>

      {/* ── Right rail ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {type !== "text" && (
          <div className="card p-4">
            <p className="text-sm font-bold">Media Preview</p>
            {showFourImageWarning && (
              <p className="mt-2 rounded-lg bg-warning-bg p-2.5 text-xs font-medium text-warning-ink">
                Heads up: only the first 4 images will post to Twitter/X, Bluesky and
                Threads.
              </p>
            )}
            {media.length === 0 ? (
              <p className="mt-3 py-8 text-center text-sm text-muted">Nothing attached yet</p>
            ) : (
              <div className="mt-3">
                <div className="relative">
                  <MediaThumb media={media[Math.min(previewIdx, media.length - 1)]} size={280} full />
                  {media.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous"
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow"
                        onClick={() => setPreviewIdx((i) => (i - 1 + media.length) % media.length)}
                      >
                        <Icon name="chevronLeft" size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Next"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 shadow"
                        onClick={() => setPreviewIdx((i) => (i + 1) % media.length)}
                      >
                        <Icon name="chevronRight" size={16} />
                      </button>
                    </>
                  )}
                </div>
                {media.length > 1 && (
                  <div className="mt-2 flex justify-center gap-1.5">
                    {media.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Preview ${i + 1}`}
                        className={`h-1.5 w-1.5 rounded-full ${i === previewIdx ? "bg-primary-deep" : "bg-line"}`}
                        onClick={() => setPreviewIdx(i)}
                      />
                    ))}
                  </div>
                )}
                <p className="mt-2 truncate text-center text-xs text-muted">
                  {media[Math.min(previewIdx, media.length - 1)]?.name}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Schedule post</p>
            <button
              type="button"
              role="switch"
              aria-checked={scheduleOn}
              className="pt-toggle"
              data-on={scheduleOn}
              onClick={() => setScheduleOn((v) => !v)}
              disabled={!editable}
            >
              <span />
            </button>
          </div>
          {scheduleOn && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <input
                  type="time"
                  className="input"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
                <InfoTip text="Times are picked in your local timezone and stored as UTC." />
              </div>
              {timeCaption && <p className="text-xs text-muted">{timeCaption}</p>}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {mode === "create" ? (
              <>
                {scheduleOn ? (
                  <button
                    className="btn-primary w-full"
                    disabled={busy || selected.size === 0 || !scheduledIso() || uploading > 0}
                    onClick={() =>
                      submit({ scheduled_at: scheduledIso() }, "/dashboard/posts/scheduled")
                    }
                  >
                    Schedule
                  </button>
                ) : (
                  <button
                    className="btn-primary w-full"
                    disabled={busy || selected.size === 0 || uploading > 0}
                    onClick={() => submit({}, "/dashboard/posts")}
                  >
                    Post now
                  </button>
                )}
                <button
                  className="btn-subtle w-full"
                  disabled={busy || selected.size === 0 || uploading > 0}
                  onClick={() => submit({ use_queue: true }, "/dashboard/posts/scheduled")}
                  title="Assign the next free queue slot from Settings → Queue"
                >
                  <Icon name="clock" size={15} /> Add to queue
                </button>
                <button
                  className="btn-subtle w-full"
                  disabled={busy || selected.size === 0 || uploading > 0}
                  onClick={() => submit({ is_draft: true }, "/dashboard/posts/draft")}
                >
                  Save to Drafts
                </button>
              </>
            ) : editable ? (
              <>
                <button
                  className="btn-primary w-full"
                  disabled={busy || selected.size === 0 || uploading > 0}
                  onClick={() =>
                    submit(
                      scheduleOn && scheduledIso()
                        ? { scheduled_at: scheduledIso(), is_draft: false }
                        : { scheduled_at: null, is_draft: true },
                      scheduleOn ? "/dashboard/posts/scheduled" : "/dashboard/posts/draft"
                    )
                  }
                >
                  Update
                </button>
                <DuplicateButton postId={post!.id} />
                <button
                  className="btn-danger w-full"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Delete this post?")) return;
                    const res = await fetch(`/api/app/posts/${post!.id}`, { method: "DELETE" });
                    if (res.ok) {
                      router.push("/dashboard/posts");
                      router.refresh();
                    }
                  }}
                >
                  Delete
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">
                  This post is {post?.status} — published posts can&apos;t be edited or
                  deleted.
                </p>
                <DuplicateButton postId={post!.id} />
              </div>
            )}
          </div>
        </div>
      </div>

      {libraryOpen && (
        <MediaLibraryModal
          onClose={() => setLibraryOpen(false)}
          onPick={(m) => {
            setMedia((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
            setLibraryOpen(false);
          }}
        />
      )}
    </div>
  );
}

function DuplicateButton({ postId }: { postId: string }) {
  const router = useRouter();
  return (
    <button
      className="btn-subtle w-full"
      onClick={async () => {
        const res = await fetch(`/api/app/posts/${postId}/duplicate`, { method: "POST" });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.id) {
          router.push(`/dashboard/create/${data.id}`);
          router.refresh();
        }
      }}
    >
      Duplicate
    </button>
  );
}

function ConfigPill({
  label,
  active,
  configured,
  onClick,
}: {
  label: string;
  active: boolean;
  configured?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pill border py-1.5 transition-colors ${
        active
          ? "border-primary bg-primary-soft text-primary-deep"
          : "border-line bg-white text-ink hover:bg-page"
      }`}
    >
      {configured && <Icon name="check" size={12} strokeWidth={3} className="text-primary-deep" />}
      {label}
      <Icon name={active ? "chevronUp" : "chevronDown"} size={12} />
    </button>
  );
}

function PlatformConfigPanel({
  platformId,
  value,
  onChange,
}: {
  platformId: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const ToggleRow = ({ k, label, desc }: { k: string; label: string; desc?: string }) => (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!value[k]}
        className="pt-toggle"
        data-on={!!value[k]}
        onClick={() => set(k, !value[k])}
      >
        <span />
      </button>
    </div>
  );
  return (
    <div className="card mt-3 flex flex-col gap-4 p-4">
      {platformId === "tiktok" && (
        <>
          <ToggleRow
            k="draft"
            label="Post as draft"
            desc="Send to your TikTok inbox instead of publishing directly"
          />
          <div>
            <label className="text-xs font-bold">Cover timestamp (ms)</label>
            <input
              type="number"
              className="input mt-1"
              placeholder="3000"
              value={(value.video_cover_timestamp_ms as number) ?? ""}
              onChange={(e) =>
                set("video_cover_timestamp_ms", e.target.value ? Number(e.target.value) : "")
              }
            />
          </div>
          <ToggleRow k="is_aigc" label="AI-generated content label" desc="Adds TikTok's AIGC disclosure" />
        </>
      )}
      {platformId === "instagram" && (
        <>
          <div>
            <label className="text-xs font-bold">Cover timestamp (ms)</label>
            <input
              type="number"
              className="input mt-1"
              placeholder="3000"
              value={(value.video_cover_timestamp_ms as number) ?? ""}
              onChange={(e) =>
                set("video_cover_timestamp_ms", e.target.value ? Number(e.target.value) : "")
              }
            />
          </div>
          <ToggleRow
            k="is_trial_reel"
            label="Trial reel"
            desc="Show to non-followers first; graduate based on performance"
          />
          {!!value.is_trial_reel && (
            <div>
              <label className="text-xs font-bold">Graduation</label>
              <select
                className="input mt-1"
                value={(value.trial_graduation as string) ?? ""}
                onChange={(e) => set("trial_graduation", e.target.value)}
              >
                <option value="">Manual</option>
                <option value="SS_PERFORMANCE">Automatic (performance)</option>
              </select>
            </div>
          )}
        </>
      )}
      {platformId === "youtube" && (
        <>
          <div>
            <label className="text-xs font-bold">Video title</label>
            <input
              className="input mt-1"
              placeholder="My Short Title"
              value={(value.title as string) ?? ""}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold">Cover timestamp (ms)</label>
            <input
              type="number"
              className="input mt-1"
              placeholder="3000"
              value={(value.video_cover_timestamp_ms as number) ?? ""}
              onChange={(e) =>
                set("video_cover_timestamp_ms", e.target.value ? Number(e.target.value) : "")
              }
            />
          </div>
        </>
      )}
      {platformId === "pinterest" && (
        <>
          <div>
            <label className="text-xs font-bold">Pin title</label>
            <input
              className="input mt-1"
              value={(value.title as string) ?? ""}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold">Destination link</label>
            <input
              className="input mt-1"
              placeholder="https://…"
              value={(value.link as string) ?? ""}
              onChange={(e) => set("link", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold">Board IDs (comma-separated)</label>
            {/* ponytail: real build fetches the account's boards from the Pinterest API */}
            <input
              className="input mt-1"
              placeholder="b1, b2"
              value={
                Array.isArray(value.board_ids) ? (value.board_ids as string[]).join(", ") : ""
              }
              onChange={(e) =>
                set(
                  "board_ids",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function MediaThumb({
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

function MediaLibraryModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (m: ComposerMedia) => void;
}) {
  const [items, setItems] = useState<ComposerMedia[] | null>(null);
  useEffect(() => {
    fetch("/api/app/media")
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []));
  }, []);
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
        {items === null ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Nothing here yet — media you upload gets reusable across posts.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {items.map((m) => (
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

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
