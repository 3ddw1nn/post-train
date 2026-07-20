"use client";

// Bulk Video/Image Scheduling per spec 03 D11: multi-file dropzone with
// validation toasts, per-row caption/date/time, bulk-apply settings rail, and a
// confirm card that spreads rows across days.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { AccountAvatar } from "@/components/platform-icon";
import { Pill } from "@/components/ui";
import { CAPTION_MAX, platform as platformOf } from "@/lib/platforms";

type Account = { id: number; platform: string; username: string; avatar_url: string | null };
type Row = {
  mediaId: string;
  name: string;
  size: number;
  kind: "video" | "image";
  caption: string;
  date: string;
  time: string;
};

const MAX_FILES = 30;
const MAX_BYTES = 250 * 1024 * 1024;
const MIN_DUR = 3;
const MAX_DUR = 120;

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

export function BulkUploader({
  kind,
  accounts,
  prefFilenameCaption,
}: {
  kind: "video" | "image";
  accounts: Account[];
  prefFilenameCaption: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rows, setRows] = useState<Row[]>([]);
  const [toasts, setToasts] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [bulkCaption, setBulkCaption] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("11:00");
  const [perDay, setPerDay] = useState(1);
  const [scheduling, setScheduling] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const noun = kind === "video" ? "video" : "image";

  function toast(msg: string) {
    setToasts((t) => [...t, msg]);
    setTimeout(() => setToasts((t) => t.slice(1)), 3500);
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (rows.length + list.length > MAX_FILES) {
      toast(`Limit is ${MAX_FILES} ${noun}s per batch.`);
      return;
    }
    let accepted = 0;
    for (const file of list) {
      if (file.size > MAX_BYTES) {
        toast(`${file.name}: over the 250MB limit — skipped.`);
        continue;
      }
      if (kind === "video") {
        if (!file.type.startsWith("video/")) {
          toast(`${file.name}: not a video — skipped.`);
          continue;
        }
        const dur = await videoDuration(file);
        if (!isNaN(dur) && (dur < MIN_DUR || dur > MAX_DUR)) {
          toast(`${file.name}: must be 3s–2min (${Math.round(dur)}s) — skipped.`);
          continue;
        }
      } else if (!file.type.startsWith("image/")) {
        toast(`${file.name}: not an image — skipped.`);
        continue;
      }
      setUploading((u) => u + 1);
      try {
        const res = await fetch("/api/app/media/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mime_type: file.type,
            size_bytes: file.size,
            name: file.name,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
        const put = await fetch(data.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed");
        if (data.complete_url) {
          const complete = await fetch(data.complete_url, { method: "POST" });
          if (!complete.ok) throw new Error("Upload completion failed");
        }
        setRows((r) => [
          ...r,
          {
            mediaId: data.media_id,
            name: file.name,
            size: file.size,
            kind,
            caption: prefFilenameCaption ? file.name.replace(/\.[^.]+$/, "") : "",
            date: "",
            time: "",
          },
        ]);
        accepted++;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((u) => u - 1);
      }
    }
    if (accepted > 0) toast(`${accepted} valid ${noun}(s) added to the queue.`);
  }

  function applyBulkSchedule() {
    if (!startDate) {
      setError("Pick a start date first.");
      return;
    }
    setError(null);
    setRows((r) =>
      r.map((row, i) => {
        const dayOffset = Math.floor(i / perDay);
        const d = new Date(`${startDate}T${startTime || "11:00"}`);
        d.setDate(d.getDate() + dayOffset);
        // stagger same-day posts by 30 min
        d.setMinutes(d.getMinutes() + (i % perDay) * 30);
        return {
          ...row,
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        };
      })
    );
  }

  async function scheduleAll() {
    setScheduling(true);
    setError(null);
    let ok = 0;
    for (const row of rows) {
      if (!row.date || !row.time) {
        setError(`"${row.name}" is missing a date/time — use Apply Bulk Schedule or fill it in.`);
        setScheduling(false);
        return;
      }
      const res = await fetch("/api/app/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: kind,
          caption: row.caption,
          media: [row.mediaId],
          social_accounts: [...selected],
          scheduled_at: new Date(`${row.date}T${row.time}`).toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(`"${row.name}": ${data?.error?.message ?? "failed"} (${ok} scheduled so far)`);
        setScheduling(false);
        router.refresh();
        return;
      }
      ok++;
    }
    setDone(ok);
    setRows([]);
    setScheduling(false);
    router.refresh();
  }

  const spreadDays = rows.length ? Math.ceil(rows.length / perDay) : 0;

  return (
    <div className="fade-up">
      {/* Toast stack */}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[80] flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t, i) => (
          <p
            key={i}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-lg fade-up"
          >
            {t}
          </p>
        ))}
      </div>

      <h1 className="flex items-center gap-2 text-2xl font-bold">
        Bulk {kind === "video" ? "Video" : "Image"} Scheduling <Pill tone="beta">Beta</Pill>
      </h1>

      {done !== null && (
        <p className="mt-3 rounded-xl bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary-dark">
          {done} {noun}s scheduled — see them on the calendar. 🎉
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {/* Accounts */}
          <p className="text-sm font-semibold text-muted">Post to</p>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
            {accounts.length === 0 && (
              <p className="text-sm text-muted">
                No {noun}-capable accounts connected yet.
              </p>
            )}
            {accounts.map((a) => (
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
                className="shrink-0"
              >
                <AccountAvatar
                  username={a.username}
                  platformId={a.platform}
                  avatarUrl={a.avatar_url}
                  size={44}
                  selected={selected.has(a.id)}
                />
              </button>
            ))}
          </div>

          {/* Dropzone */}
          <div
            className="mt-4 flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-white p-10 text-center transition-colors hover:border-primary"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            aria-label={`Upload ${noun}s`}
          >
            <Icon name="upload" size={26} className="text-muted" />
            <p className="font-semibold">Click to upload or drag and drop</p>
            <p className="text-xs text-muted">
              Up to {MAX_FILES} {noun}s
              {kind === "video" ? " (max 250MB, 3s–2min each)" : " (max 250MB each)"}
            </p>
            {uploading > 0 && (
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-primary-deep">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Uploading…
              </p>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept={kind === "video" ? "video/*" : "image/*"}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Rows */}
          <h2 className="mt-6 font-bold">
            Your {kind === "video" ? "Videos" : "Images"} ({rows.length})
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {rows.map((row, i) => (
              <div key={row.mediaId} className="card flex flex-wrap items-start gap-3 p-4">
                {row.kind === "video" ? (
                  <video
                    src={`/api/media-file/${row.mediaId}`}
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    muted
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media-file/${row.mediaId}`}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{row.name}</p>
                    <span className="text-xs text-muted">
                      {(row.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${row.name}`}
                      className="ml-auto text-muted hover:text-danger"
                      onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
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
                  <div className="mt-2 flex gap-2">
                    <input
                      type="date"
                      className="input w-auto"
                      value={row.date}
                      onChange={(e) =>
                        setRows((r) =>
                          r.map((x, j) => (j === i ? { ...x, date: e.target.value } : x))
                        )
                      }
                    />
                    <input
                      type="time"
                      className="input w-auto"
                      value={row.time}
                      onChange={(e) =>
                        setRows((r) =>
                          r.map((x, j) => (j === i ? { ...x, time: e.target.value } : x))
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <p className="font-bold">Bulk Schedule Settings</p>
            <label className="mt-3 block text-xs font-bold">Bulk Caption</label>
            <div className="relative mt-1">
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
              className="btn-subtle mt-2 w-full"
              disabled={!bulkCaption.trim() || rows.length === 0}
              onClick={() => setRows((r) => r.map((x) => ({ ...x, caption: bulkCaption })))}
            >
              Apply Captions to All {kind === "video" ? "Videos" : "Images"}
            </button>
            <label className="mt-4 block text-xs font-bold">Start Date</label>
            <input
              type="date"
              className="input mt-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <label className="mt-3 block text-xs font-bold">Start Time</label>
            <input
              type="time"
              className="input mt-1"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <label className="mt-3 block text-xs font-bold">
              {kind === "video" ? "Videos" : "Images"} per day (1–10)
            </label>
            <select
              className="input mt-1"
              value={perDay}
              onChange={(e) => setPerDay(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              className="btn mt-3 w-full bg-primary text-primary-contrast hover:bg-primary-hover"
              disabled={rows.length === 0}
              onClick={applyBulkSchedule}
            >
              Apply Bulk Schedule
            </button>
          </div>

          <div className="card p-4">
            <p className="font-bold">Confirm &amp; Schedule All</p>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Please upload at least one {noun}.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">
                  {rows.length} {noun}s will be scheduled to the following accounts:
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {accounts
                    .filter((a) => selected.has(a.id))
                    .map((a) => (
                      <AccountAvatar
                        key={a.id}
                        username={a.username}
                        platformId={a.platform}
                        avatarUrl={a.avatar_url}
                        size={28}
                      />
                    ))}
                  {selected.size === 0 && (
                    <p className="text-xs font-semibold text-danger">
                      Select at least one account above.
                    </p>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Posts will be spread over approximately {spreadDays} day
                  {spreadDays === 1 ? "" : "s"}. {perDay} {noun}
                  {perDay === 1 ? "" : "s"} will be posted per day.
                </p>
              </>
            )}
            <button
              className="btn-primary mt-3 w-full"
              disabled={rows.length === 0 || selected.size === 0 || scheduling || uploading > 0}
              onClick={scheduleAll}
            >
              {scheduling
                ? "Scheduling…"
                : `Schedule All ${rows.length} ${kind === "video" ? "Videos" : "Images"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
