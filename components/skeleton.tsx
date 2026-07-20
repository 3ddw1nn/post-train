export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-lg ${className}`} />;
}

export function PageHeaderSkeleton({
  actions = 2,
  eyebrow = false,
}: {
  actions?: number;
  eyebrow?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {eyebrow && <SkeletonBlock className="mb-2 h-4 w-28" />}
        <SkeletonBlock className="h-8 w-48 max-w-full" />
        <SkeletonBlock className="mt-2 h-4 w-80 max-w-full" />
      </div>
      {actions > 0 && (
        <div className="flex shrink-0 gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <SkeletonBlock key={i} className="h-9 w-24" />
          ))}
        </div>
      )}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-20" />
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({
  rows = 5,
  thumb = true,
}: {
  rows?: number;
  thumb?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-center gap-4">
            {thumb && <SkeletonBlock className="h-14 w-14 shrink-0" />}
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-3/4 max-w-full" />
              <div className="mt-3 flex gap-2">
                <SkeletonBlock className="h-6 w-6 rounded-full" />
                <SkeletonBlock className="h-6 w-6 rounded-full" />
                <SkeletonBlock className="h-6 w-6 rounded-full" />
              </div>
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
              <SkeletonBlock className="h-6 w-20 rounded-full" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
            <SkeletonBlock className="h-9 w-9 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="card overflow-hidden p-0">
      <div
        className="grid border-b border-line px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={i} className="h-4 w-20 max-w-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid items-center gap-3 border-b border-line px-4 py-3 last:border-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, col) => (
            <SkeletonBlock key={col} className={col === 0 ? "h-5 w-full" : "h-4 w-16"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="fade-up">
      <PageHeaderSkeleton />
      <div className="mt-6">
        <StatGridSkeleton />
      </div>
      <div className="mt-4">
        <CardListSkeleton rows={4} />
      </div>
    </div>
  );
}

export function CreateHubSkeleton() {
  return (
    <div className="fade-up mx-auto max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Create a new post</h1>
          <p className="mt-1 text-sm text-muted">Pick a format, then choose where it ships.</p>
        </div>
        <SkeletonBlock className="mt-1 h-6 w-24 shrink-0 rounded-full" />
      </div>

      <div className="card mt-6 divide-y divide-line overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <SkeletonBlock className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-5 w-52 max-w-full" />
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 7 }).map((__, j) => (
                  <SkeletonBlock key={j} className="h-4 w-4 rounded-full" />
                ))}
              </div>
            </div>
            <SkeletonBlock className="h-5 w-5 shrink-0" />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        <SkeletonBlock className="h-4 w-4 shrink-0 rounded-full" />
        <SkeletonBlock className="h-4 w-72 max-w-full" />
      </div>
    </div>
  );
}

export function ConnectionsSkeleton() {
  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="mt-1 text-sm text-muted">Every account your posts can depart to.</p>
        </div>
        <div>
          <SkeletonBlock className="h-5 w-28" />
          <SkeletonBlock className="mt-1.5 h-1 w-36 rounded-full" />
        </div>
      </div>
      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page/50 px-4 py-2.5">
          <SkeletonBlock className="h-6 w-32" />
          <SkeletonBlock className="h-6 w-24" />
        </div>
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex w-32 shrink-0 items-center gap-2.5">
                <SkeletonBlock className="h-5 w-5 rounded-full" />
                <SkeletonBlock className="h-4 w-20" />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {Array.from({ length: i % 3 === 0 ? 2 : 1 }).map((__, j) => (
                  <SkeletonBlock key={j} className="h-8 w-28 rounded-full" />
                ))}
              </div>
              <SkeletonBlock className="ml-auto h-8 w-24 shrink-0" />
            </div>
          ))}
        </div>
        <div className="border-t border-line px-4 py-3">
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </div>
      </div>
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            Analytics <SkeletonBlock className="h-6 w-12 rounded-full" />
          </h1>
          <p className="mt-1 text-sm text-muted">
            Views, likes, comments and shares — synced on demand.
          </p>
        </div>
        <SkeletonBlock className="h-9 w-20" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-b border-line">
        <div className="flex gap-1">
          {["Overview", "Posts"].map((label, i) => (
            <span
              key={label}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${
                i === 0 ? "border-primary text-ink" : "border-transparent text-muted"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="mb-1.5 inline-flex shrink-0 rounded-[10px] border border-line bg-white p-0.5">
          {["7d", "30d", "90d", "all"].map((label, i) => (
            <span
              key={label}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                i === 1 ? "bg-primary text-primary-contrast" : "text-muted"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="mt-2 h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-4">
          <h2 className="font-bold">By platform</h2>
          <div className="mt-2 flex flex-col divide-y divide-line">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <SkeletonBlock className="h-5 w-5 rounded-full" />
                <SkeletonBlock className="h-5 w-24" />
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="ml-auto h-5 w-20" />
                <SkeletonBlock className="h-8 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BulkToolsSkeleton() {
  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Bulk tools</h1>
      <div className="mt-6 rounded-xl border border-line bg-primary-soft/30 p-5">
        <SkeletonBlock className="h-6 w-36 rounded-full" />
        <SkeletonBlock className="mt-3 h-6 w-full max-w-2xl" />
        <SkeletonBlock className="mt-3 h-4 w-full max-w-xl" />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl border border-line bg-white p-6">
            <div className="flex gap-2">
              <SkeletonBlock className="h-8 w-8" />
              <SkeletonBlock className="h-8 w-8" />
            </div>
            <div>
              <SkeletonBlock className="h-5 w-44" />
              <SkeletonBlock className="mt-3 h-4 w-full" />
            </div>
            <div className="flex gap-1 pt-1">
              {Array.from({ length: 6 }).map((__, j) => (
                <SkeletonBlock key={j} className="h-4 w-4 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BulkUploaderSkeleton({ kind }: { kind: "Video" | "Image" }) {
  const noun = kind.toLowerCase();
  return (
    <div className="fade-up">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        Bulk {kind} Scheduling <SkeletonBlock className="h-6 w-12 rounded-full" />
      </h1>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">Post to</p>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-11 w-11 shrink-0 rounded-full" />
            ))}
          </div>

          <div className="mt-4 flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-white p-10 text-center">
            <SkeletonBlock className="h-7 w-7" />
            <p className="font-semibold">Click to upload or drag and drop</p>
            <p className="text-xs text-muted">Up to 30 {noun}s</p>
          </div>

          <h2 className="mt-6 font-bold">Your {kind}s</h2>
          <div className="mt-3 flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card flex flex-wrap items-start gap-3 p-4">
                <SkeletonBlock className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-5 w-60 max-w-full" />
                  <SkeletonBlock className="mt-2 h-16 w-full" />
                  <div className="mt-2 flex gap-2">
                    <SkeletonBlock className="h-10 w-36" />
                    <SkeletonBlock className="h-10 w-28" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <p className="font-bold">Bulk Schedule Settings</p>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="mt-3">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-1 h-10 w-full" />
              </div>
            ))}
          </div>
          <div className="card p-4">
            <p className="font-bold">Confirm &amp; Schedule All</p>
            <SkeletonBlock className="mt-3 h-4 w-full" />
            <SkeletonBlock className="mt-3 h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ApiKeysSkeleton() {
  return (
    <div className="fade-up mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="mt-1 text-sm text-muted">
            Post programmatically — same engine, no dashboard required.
          </p>
        </div>
        <SkeletonBlock className="h-10 w-36" />
      </div>

      <section className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-page/50 px-4 py-2.5">
          <h2 className="text-sm font-bold">Active keys</h2>
          <SkeletonBlock className="h-4 w-12" />
        </div>
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-5 w-40" />
                <SkeletonBlock className="mt-1 h-4 w-48" />
              </div>
              <SkeletonBlock className="h-7 w-28" />
              <SkeletonBlock className="h-8 w-20" />
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-4 divide-y divide-line">
        <div className="p-5">
          <h2 className="text-sm font-bold">Webhook</h2>
          <SkeletonBlock className="mt-2 h-4 w-full" />
          <div className="mt-3 flex items-center gap-2">
            <SkeletonBlock className="h-10 flex-1" />
            <SkeletonBlock className="h-10 w-16 shrink-0" />
          </div>
          <SkeletonBlock className="mt-3 h-4 w-72 max-w-full" />
        </div>
        <div className="p-5">
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="mt-2 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-80 max-w-full" />
        </div>
      </section>
    </div>
  );
}

export function TeamsSkeleton() {
  return (
    <div className="fade-up mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Teams</h1>
      <p className="mt-1 text-sm text-muted">
        Share a workspace — everyone posts to the same connected accounts.
      </p>
      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-bold">My Teams</h2>
        <div className="flex gap-2">
          <SkeletonBlock className="h-9 w-9" />
          <SkeletonBlock className="h-9 w-28" />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line bg-page/50 px-5 py-3">
              <SkeletonBlock className="h-4 w-4" />
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="ml-auto h-4 w-20" />
            </div>
            <div className="flex flex-col divide-y divide-line">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="flex items-center gap-3 px-5 py-2.5">
                  <SkeletonBlock className="h-7 w-7 rounded-full" />
                  <SkeletonBlock className="h-4 w-48" />
                  <SkeletonBlock className="ml-auto h-4 w-20" />
                </div>
              ))}
            </div>
            <div className="border-t border-line px-5 py-3">
              <SkeletonBlock className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-page/50 px-5 py-3">
          <h2 className="text-sm font-bold">Current plan</h2>
          <SkeletonBlock className="h-6 w-16 rounded-full" />
        </div>
        <div className="p-5">
          <div className="flex items-baseline justify-between">
            <SkeletonBlock className="h-7 w-40" />
            <SkeletonBlock className="h-5 w-24" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="mt-2 h-5 w-32" />
            </div>
            <div>
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="mt-2 h-5 w-20" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <SkeletonBlock className="h-10 w-28" />
            <SkeletonBlock className="h-10 w-36" />
            <SkeletonBlock className="h-10 w-40" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5">
          <div>
            <h3 className="font-bold">API Addon</h3>
            <SkeletonBlock className="mt-2 h-4 w-96 max-w-full" />
            <SkeletonBlock className="mt-2 h-4 w-72 max-w-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-6 w-20 rounded-full" />
            <SkeletonBlock className="h-10 w-32" />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-10 w-44" />
        <SkeletonBlock className="h-10 w-32" />
        <SkeletonBlock className="h-4 w-full max-w-md" />
      </div>
    </div>
  );
}

export function PlansSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5">
            <SkeletonBlock className="h-6 w-28" />
            <SkeletonBlock className="mt-3 h-9 w-24" />
            <div className="mt-5 flex flex-col gap-3">
              {Array.from({ length: 5 }).map((__, j) => (
                <SkeletonBlock key={j} className="h-4 w-full" />
              ))}
            </div>
            <SkeletonBlock className="mt-6 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComposerSkeleton() {
  return (
    <div className="fade-up grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <SkeletonBlock className="h-8 w-56" />
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm font-semibold text-muted">Search &amp; Filter</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">Remember</span>
            <SkeletonBlock className="h-6 w-11 rounded-full" />
          </div>
        </div>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-11 w-11 shrink-0 rounded-full" />
          ))}
        </div>

        <div className="mt-4 flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-line bg-white p-6 text-center">
          <SkeletonBlock className="h-6 w-6" />
          <p className="text-sm font-semibold">Click to upload or drag and drop</p>
          <SkeletonBlock className="h-4 w-64 max-w-full" />
          <SkeletonBlock className="mt-1 h-8 w-20" />
        </div>

        <div className="mt-5">
          <label className="text-sm font-bold">Main Caption</label>
          <SkeletonBlock className="mt-2 h-40 w-full" />
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Post configurations &amp; tools
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Platform Captions", "Past Captions", "TikTok Config", "Instagram Config"].map(
              (label) => (
                <SkeletonBlock key={label} className="h-8 w-32 rounded-full" />
              )
            )}
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-muted">
            Per-account caption overrides
          </summary>
        </details>
      </div>

      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <p className="text-sm font-bold">Media Preview</p>
          <SkeletonBlock className="mt-3 aspect-square w-full" />
          <SkeletonBlock className="mx-auto mt-2 h-4 w-40" />
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Schedule post</p>
            <SkeletonBlock className="h-6 w-11 rounded-full" />
          </div>
          <div className="mt-3 flex gap-2">
            <SkeletonBlock className="h-10 flex-1" />
            <SkeletonBlock className="h-10 flex-1" />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudioWizardSkeleton() {
  return (
    <div className="fade-up">
      <div className="card mx-auto max-w-2xl p-6">
        <span className="text-sm text-muted">Content Studio</span>
        <SkeletonBlock className="mt-2 h-8 w-56" />
        <SkeletonBlock className="mt-2 h-4 w-full" />

        <div className="mt-4 flex gap-2">
          <SkeletonBlock className="h-8 w-32" />
          <SkeletonBlock className="h-8 w-28" />
        </div>

        <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-hidden sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border-2 border-transparent">
              <SkeletonBlock className="aspect-[9/16] w-full rounded-none" />
              <SkeletonBlock className="m-1.5 h-4 w-16" />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-muted">Hook / script</label>
          <SkeletonBlock className="mt-1 h-28 w-full" />
        </div>

        <div className="mt-2">
          <SkeletonBlock className="h-20 w-full" />
        </div>

        <div className="mt-4 rounded-xl bg-page p-3">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-3/4" />
        </div>

        <SkeletonBlock className="mt-4 h-10 w-full" />
      </div>
    </div>
  );
}

export function BulkCreationSkeleton() {
  return (
    <div className="fade-up mx-auto max-w-xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        Bulk Video Creation <SkeletonBlock className="h-6 w-12 rounded-full" />
      </h1>
      <div className="card mt-5 flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-8" />
          <SkeletonBlock className="h-8 w-8" />
        </div>
        <SkeletonBlock className="h-5 w-64 max-w-full" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-4/5" />
        <div className="mt-2 flex gap-2">
          <SkeletonBlock className="h-10 w-40" />
          <SkeletonBlock className="h-10 w-36" />
        </div>
      </div>
    </div>
  );
}

export function QueueSkeleton() {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page/50 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold">Queue Schedule</h2>
          <SkeletonBlock className="mt-1 h-3 w-64" />
        </div>
        <SkeletonBlock className="h-6 w-32" />
      </div>

      <div className="p-5 pt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-muted">
                {["Time", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <th key={d} className="pb-2 pr-2 text-center first:text-left">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2.5 pr-2">
                    <SkeletonBlock className="h-5 w-20" />
                  </td>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="py-2.5 text-center">
                      <SkeletonBlock className="mx-auto h-6 w-6 rounded-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
          <SkeletonBlock className="h-5 w-5" />
          <SkeletonBlock className="h-10 w-36" />
          <SkeletonBlock className="h-10 w-28" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-line p-5">
        <div>
          <h2 className="text-sm font-bold">Randomize posting time</h2>
          <SkeletonBlock className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <SkeletonBlock className="h-6 w-11 rounded-full" />
      </div>
    </section>
  );
}

export function SettingsPanelSkeleton() {
  // Renders inside the settings layout, which already shows the h1 + tabs.
  return (
    <div className="card divide-y divide-line">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid gap-3 p-5 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-6">
          <div>
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="mt-2 h-3 w-36" />
          </div>
          <div>
            <SkeletonBlock className="h-4 w-4/5" />
            <SkeletonBlock className="mt-3 h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StudioSkeleton() {
  return (
    <div className="fade-up">
      <div className="card p-6">
        <PageHeaderSkeleton actions={0} />
        <div className="mt-5 rounded-xl border border-line bg-primary-soft/30 p-5">
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="mt-3 h-5 w-64 max-w-full" />
          <SkeletonBlock className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="mt-5 flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <SkeletonBlock className="h-10 w-10 shrink-0" />
              <div className="flex-1">
                <SkeletonBlock className="h-5 w-40" />
                <SkeletonBlock className="mt-2 h-4 w-3/4" />
              </div>
              <SkeletonBlock className="h-8 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
