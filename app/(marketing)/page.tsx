import Link from "next/link";
import { PLATFORMS } from "@/lib/platforms";
import { API_ADDON } from "@/lib/billing-data";
import { PlatformIcon, PlatformIconRow } from "@/components/platform-icon";
import { PlanPicker } from "@/components/plan-picker";
import { Icon } from "@/components/icons";
import { UserAvatar } from "@/components/avatar-menu";

export const metadata = {
  title: "Post Train — schedule and cross-post to 10 platforms",
};

const ALL_IDS = PLATFORMS.map((p) => p.id);

const FAQ: [string, string][] = [
  [
    "How is Post Train different from the big enterprise schedulers?",
    "We do one job extremely well: get your content onto every platform fast. No per-channel pricing, no bloated inbox suites, no 40-page onboarding. Upload once, pick accounts, post — that's the whole product.",
  ],
  [
    "Which platforms are supported?",
    "Twitter/X, Instagram, LinkedIn, Facebook, TikTok, YouTube, Bluesky, Threads, Pinterest and Google Business — with more on the way.",
  ],
  [
    "How many accounts can I connect?",
    "Creator includes 15 connected accounts, Growth 50, and Pro is unlimited. You can spread them across platforms however you like.",
  ],
  [
    "What counts as a social account?",
    "One profile, page or channel on one platform. Your brand's TikTok and your personal TikTok are two accounts.",
  ],
  [
    "Can I connect multiple accounts on the same platform?",
    "Yes — every plan supports multiple accounts per platform, up to your plan's total.",
  ],
  [
    "Is there a limit on posts?",
    "Paid plans are unlimited. The free tier includes 5 posts, and each destination account counts as one — posting once to 4 platforms uses 4.",
  ],
  [
    "What content types can I post?",
    "Text, images (including carousels), video, and stories (Facebook & Instagram). Per-platform tweaks like YouTube titles or TikTok draft mode are built in.",
  ],
  [
    "Will scheduled posts reach fewer people than posting manually?",
    "No. Posts go out through each platform's official API — the same door the native apps use. Platforms don't penalize API posts.",
  ],
  [
    "Can I cancel anytime?",
    "Yes, in two clicks from Billing. If you cancel a paid period you keep access until it ends.",
  ],
  [
    "What's the refund policy?",
    "If you're unhappy within 7 days of any charge, we refund it — no interview required.",
  ],
  [
    "Do you store my social media passwords?",
    "Never. Every connection uses the platform's official OAuth sign-in; we only hold revocable tokens.",
  ],
  [
    "How do I get help?",
    "Email ehleedev@gmail.com or use the chat bubble — a human replies fast.",
  ],
];

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            {ALL_IDS.map((id) => (
              <PlatformIcon key={id} id={id} size={22} />
            ))}
          </div>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight lg:text-5xl">
            One upload.
            <br />
            Every platform.
            <br />
            <span className="text-primary-deep">Two minutes.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted">
            Post Train is the no-nonsense cross-poster: schedule your content to 10
            social platforms from one dashboard, with real humans answering support.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link href="/create-account" className="btn-primary !px-6 !py-3 text-base">
              Try it for free
            </Link>
            <div className="flex flex-col text-sm">
              <Link href="/agents" className="font-semibold text-primary-deep hover:underline">
                Connect any AI agent →
              </Link>
              <Link href="/mcp" className="font-semibold text-primary-deep hover:underline">
                Manage social from Claude (MCP) →
              </Link>
            </div>
          </div>
          <p className="mt-6 text-sm text-muted">
            7-day free trial · $0.00 due today · cancel anytime
          </p>
        </div>
        {/* Product mock */}
        <div className="card overflow-hidden shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-line bg-page px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          </div>
          <div className="p-5">
            <p className="text-sm font-bold">Create image post</p>
            <div className="mt-3 flex gap-2">
              {ALL_IDS.slice(0, 6).map((id, i) => (
                <span
                  key={id}
                  className={`flex h-9 w-9 items-center justify-center rounded-full bg-page ${i < 4 ? "ring-2 ring-primary" : "opacity-50"}`}
                >
                  <PlatformIcon id={id} size={16} />
                </span>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-line bg-page/50 p-3 text-sm text-muted">
              Fresh drop 🚂 — the same post, everywhere your audience lives…
              <span className="mt-2 block text-right text-xs">64/2200</span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-line p-3">
              <span className="text-sm font-semibold">Schedule post</span>
              <span className="pt-toggle" data-on="true"><span /></span>
            </div>
            <button className="btn-primary mt-3 w-full">Schedule</button>
          </div>
        </div>
      </section>

      {/* ── Featured-on band (placeholder slots) ─────────── */}
      <section className="border-y border-line bg-page py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 text-sm font-bold uppercase tracking-widest text-muted/60">
          <span>As seen on</span>
          <span>Indie launch boards</span>
          <span>Builder newsletters</span>
          <span>Creator communities</span>
        </div>
      </section>

      {/* ── Feature blocks ───────────────────────────────── */}
      <section id="features" className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-20">
        <FeatureBlock
          icon="send"
          eyebrow="Cross-posting"
          title="Stop re-uploading the same clip five times"
          copy="Select every account you own — multiple per platform — and ship the same post everywhere at once. Captions can differ per platform or per account when you need them to."
          media={<PlatformIconRow ids={ALL_IDS} size={26} />}
        />
        <FeatureBlock
          flip
          icon="clock"
          eyebrow="Scheduling"
          title="A queue that keeps you consistent"
          copy="Set your weekly posting slots once and every new post grabs the next free one. Exact-time scheduling and ±10-minute randomization included."
          media={<QueueMock />}
        />
        <FeatureBlock
          icon="calendar"
          eyebrow="Content management"
          title="Calendar, drafts and history in one place"
          copy="Month and week views of everything scheduled and shipped, with per-platform results and share links for every post."
          media={<CalendarMock />}
        />
        <FeatureBlock
          flip
          icon="video"
          eyebrow="Content studio"
          title="Turn raw clips into formats that travel"
          copy="Grid videos, fade-ins, AI-assisted UGC — start from a template, drop your media in, and send it straight to the composer."
          media={<StudioMock />}
        />
      </section>

      {/* ── Capability grid: the rest of the operation, not just posting ── */}
      <section className="border-t border-line bg-page py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-extrabold">
            The rest of the operation, not just posting
          </h2>
          <p className="mt-2 text-center text-sm text-muted">
            Every plan ships with the parts a real team actually needs day to day.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <CapabilityCard
              title="Deep Analytics"
              copy="Views, likes, comments and shares, synced straight from each platform."
              tags={["Real-time sync", "Every platform"]}
              mock={<AnalyticsMock />}
            />
            <CapabilityCard
              title="Team Workspaces"
              copy="Invite editors or VAs into your workspace — no shared logins required."
              tags={["Invite by email", "No shared logins"]}
              mock={<TeamsMock />}
            />
            <CapabilityCard
              title="Unlimited Connections"
              copy="Multiple accounts per platform on every plan — Pro removes the cap."
              tags={["Multi-account", "Every plan"]}
              mock={<ConnectionsMock />}
            />
            <CapabilityCard
              title="Batch Scheduler"
              copy="Turn a folder of clips into a week of scheduled posts in one pass."
              tags={["Bulk upload", "One queue"]}
              mock={<BatchMock />}
            />
            <CapabilityCard
              title="OAuth-Only, Always"
              copy="Every connection uses the platform's own sign-in — we never see a password."
              tags={["Zero passwords", "Official sign-in"]}
              mock={<SecurityMock />}
            />
            <CapabilityCard
              title="Content Creation Studio"
              copy="Grid edits, fades and AI-assisted UGC — start from a template and send it straight to the composer."
              tags={["Templates", "AI-assisted"]}
              mock={<StudioCapabilityMock />}
            />
          </div>
        </div>
      </section>

      {/* ── Stats band ───────────────────────────────────── */}
      <section className="border-y border-line bg-primary-dark py-12 text-white">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 px-6 text-center sm:grid-cols-3">
          {[
            ["10", "platforms, one dashboard"],
            ["<2 min", "from upload to everywhere"],
            ["7 days", "free on every plan"],
          ].map(([big, small]) => (
            <div key={small}>
              <p className="text-4xl font-extrabold text-primary">{big}</p>
              <p className="mt-1 text-sm text-white/80">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials (placeholder wall) ──────────────── */}
      <section id="reviews" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-extrabold">What early riders say</h2>
        <p className="mt-2 text-center text-sm text-muted">
          Fresh product, honest wall — these slots fill with real customer words, not
          purchased praise.
        </p>
        <div className="mt-8 columns-1 gap-4 md:columns-2 lg:columns-3">
          {[
            "“I batch a week of shorts on Sunday and don't think about posting again.”",
            "“The queue is the feature. Set the slots, feed the machine.”",
            "“Swapped a $200/mo suite for this and lost nothing I actually used.”",
            "“Connected 9 accounts in one sitting. The OAuth flow just works.”",
            "“Per-account captions saved my agency's client setup.”",
            "“The API add-on turned our content pipeline into a cron job.”",
          ].map((quote, i) => (
            <figure key={i} className="card mb-4 break-inside-avoid p-5">
              <blockquote className="text-sm">{quote}</blockquote>
              <figcaption className="mt-3 flex items-center gap-2 text-xs text-muted">
                <span className="h-7 w-7 rounded-full bg-primary-soft" />
                Early access user · sample slot
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Founder note ─────────────────────────────────── */}
      <section className="mx-auto max-w-2xl px-6 pb-20">
        <div className="card p-8">
          <p className="text-xs font-bold uppercase tracking-wide text-primary-deep">
            Why we built this
          </p>
          <p className="mt-3 text-lg leading-relaxed">
            We were spending an hour a day re-uploading the same clips app by app —
            resizing here, retyping captions there. So we built the tool we wanted: a
            train that leaves on schedule and stops at every station. Load your content
            once, and it gets where it's going.
          </p>
          <p className="mt-4 text-sm font-semibold text-muted">— The Post Train team</p>
        </div>
      </section>

      {/* ── Platforms grid ───────────────────────────────── */}
      <section id="platforms" className="border-t border-line bg-page py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-extrabold">Supported platforms</h2>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {PLATFORMS.map((p) => (
              <Link
                key={p.id}
                href={`/${p.slug}`}
                className="card flex items-center gap-2.5 p-4 text-sm font-semibold transition-colors hover:border-primary"
              >
                <PlatformIcon id={p.id} size={20} /> {p.name}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-muted">More to come.</p>
        </div>
      </section>

      {/* ── Developer API ────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="card grid gap-8 p-8 lg:grid-cols-2 lg:p-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary-deep">
              Developer API
            </p>
            <h2 className="mt-2 text-2xl font-extrabold">
              Your content pipeline, programmable
            </h2>
            <p className="mt-3 text-sm text-muted">
              REST API, signed webhooks and an MCP server for AI agents. ${API_ADDON.monthly}
              /mo or ${API_ADDON.yearly}/yr as an add-on — requires an active subscription.
            </p>
            <div className="mt-5 flex gap-3">
              <Link href="/docs/api" className="btn-dark">
                View API Docs
              </Link>
              <Link href="/dashboard/api-keys" className="btn-subtle">
                Get API Keys
              </Link>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-ink p-5 text-xs leading-relaxed text-primary">
{`curl -X POST https://your-host/api/v1/posts \\
  -H "Authorization: Bearer pt_live_..." \\
  -d '{
    "caption": "shipping day 🚂",
    "media_urls": ["https://cdn/site/demo.mp4"],
    "social_accounts": [1, 2, 3],
    "use_queue": true
  }'`}
          </pre>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section id="pricing" className="border-t border-line bg-page py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-extrabold">Fair, flat pricing</h2>
          <p className="mt-2 text-center text-sm text-muted">
            No per-channel fees. No contact-sales button. Unlimited posts on every paid
            plan.
          </p>
          <div className="mt-10">
            <PlanPicker mode="marketing" />
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-extrabold">Questions, answered</h2>
        <div className="mt-8 flex flex-col gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card group p-5">
              <summary className="flex cursor-pointer items-center justify-between font-semibold">
                {q}
                <span className="text-muted transition-transform group-open:rotate-180">
                  <Icon name="chevronDown" size={16} />
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <section className="border-t border-line bg-primary-dark py-16 text-center text-white">
        <h2 className="text-3xl font-extrabold">All aboard.</h2>
        <p className="mx-auto mt-2 max-w-md text-white/80">
          Your next post could be on 10 platforms in the next two minutes.
        </p>
        <Link href="/create-account" className="btn-primary mt-6 !px-8 !py-3 text-base">
          Try it for free
        </Link>
      </section>
    </>
  );
}

function FeatureBlock({
  icon,
  eyebrow,
  title,
  copy,
  media,
  flip,
}: {
  icon: string;
  eyebrow: string;
  title: string;
  copy: string;
  media: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className={`grid items-center gap-10 md:grid-cols-2 ${flip ? "md:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-page text-primary-deep">
            <Icon name={icon} size={14} strokeWidth={1.8} />
          </span>
          <p className="text-sm font-semibold text-muted">{eyebrow}</p>
        </div>
        <h2 className="mt-3 text-2xl font-extrabold lg:text-3xl">{title}</h2>
        <p className="mt-3 leading-relaxed text-muted">{copy}</p>
        <div className="mt-5 flex gap-3">
          <Link href="/create-account" className="btn-primary">
            Try it for free
          </Link>
          <Link href="/#pricing" className="btn-subtle">
            See pricing
          </Link>
        </div>
      </div>
      <div className="card flex min-h-40 items-center justify-center p-8">{media}</div>
    </div>
  );
}

function CapabilityCard({
  title,
  copy,
  tags,
  mock,
}: {
  title: string;
  copy: string;
  tags: string[];
  mock: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex h-40 items-center justify-center border-b border-line bg-page/60 p-6">
        {mock}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{copy}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3">
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Icon name="check" size={13} className="text-primary-deep" /> {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsMock() {
  const bars = [4, 6, 5, 8, 6, 10, 7, 9];
  return (
    <div className="w-full max-w-[220px]">
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border border-line bg-white px-2.5 py-2">
          <p className="flex items-center gap-1 text-[10px] font-bold text-blue-600">
            <Icon name="eye" size={10} /> Views
          </p>
          <p className="mt-0.5 flex items-baseline gap-1 text-sm font-extrabold">
            1.2M <span className="text-[9px] font-bold text-emerald-600">+18%</span>
          </p>
        </div>
        <div className="flex-1 rounded-lg border border-line bg-white px-2.5 py-2">
          <p className="flex items-center gap-1 text-[10px] font-bold text-rose-500">
            <Icon name="sparkles" size={10} /> Likes
          </p>
          <p className="mt-0.5 flex items-baseline gap-1 text-sm font-extrabold">
            84K <span className="text-[9px] font-bold text-emerald-600">+9%</span>
          </p>
        </div>
      </div>
      <div className="mt-2 flex h-10 items-end gap-1">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-sm ${i === 5 ? "bg-primary" : "bg-primary-soft"}`}
            style={{ height: `${h * 10}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function TeamsMock() {
  return (
    <div className="flex w-full max-w-[220px] items-center justify-center">
      <div className="flex -space-x-2.5">
        {["Ana", "Jon", "Mia"].map((name) => (
          <span key={name} className="relative rounded-full ring-2 ring-white">
            <UserAvatar name={name} size={36} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </span>
        ))}
      </div>
      <span className="ml-3 rounded-full border border-dashed border-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-muted">
        +2 more
      </span>
    </div>
  );
}

function ConnectionsMock() {
  const sample = ALL_IDS.slice(0, 4);
  return (
    <div className="grid w-full max-w-[220px] grid-cols-2 gap-2">
      {sample.map((id, i) => (
        <div
          key={id}
          className="flex items-center justify-between gap-1.5 rounded-lg border border-line bg-white px-2.5 py-2"
        >
          <PlatformIcon id={id} size={16} />
          <span className="text-[10px] font-bold text-primary-deep">×{i % 2 === 0 ? 2 : 3}</span>
        </div>
      ))}
    </div>
  );
}

function BatchMock() {
  return (
    <div className="grid w-full max-w-[220px] grid-cols-3 gap-1.5">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className={`flex h-11 items-center justify-center rounded-lg border ${
            i < 4 ? "border-primary/30 bg-primary-soft" : "border-amber-200 bg-amber-50"
          }`}
        >
          {i < 4 ? (
            <Icon name="check" size={14} className="text-primary-deep" />
          ) : (
            <Icon name="clock" size={13} className="text-amber-500" />
          )}
        </div>
      ))}
    </div>
  );
}

function SecurityMock() {
  return (
    <div className="flex w-full max-w-[220px] flex-col items-center gap-2.5">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-deep">
        <Icon name="shield" size={22} strokeWidth={1.8} />
      </span>
      <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
        <Icon name="lock" size={10} /> No password stored
      </span>
    </div>
  );
}

function StudioCapabilityMock() {
  return (
    <div className="grid w-full max-w-[220px] grid-cols-3 gap-2">
      <span className="flex h-14 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
        <Icon name="video" size={18} />
      </span>
      <span className="flex h-14 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
        <Icon name="image" size={18} />
      </span>
      <span className="flex h-14 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
        <Icon name="grid" size={18} />
      </span>
      <span className="col-span-3 mt-0.5 flex items-center justify-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-bold text-muted">
        <Icon name="sparkles" size={10} className="text-violet-500" /> AI-assisted
      </span>
    </div>
  );
}

function QueueMock() {
  return (
    <div className="w-full max-w-xs text-sm">
      {["11:00 AM", "4:00 PM"].map((t) => (
        <div key={t} className="flex items-center justify-between border-b border-line py-2 last:border-0">
          <span className="font-semibold">{t}</span>
          <span className="flex gap-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span
                key={i}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < 5 ? "bg-primary text-primary-contrast" : "bg-page text-muted"
                }`}
              >
                {d}
              </span>
            ))}
          </span>
        </div>
      ))}
      <p className="mt-2 text-xs text-muted">Next free slot: tomorrow 11:00 AM</p>
    </div>
  );
}

function StudioMock() {
  return (
    <div className="flex w-full max-w-xs items-center gap-3">
      <div className="flex h-16 w-12 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-line bg-page text-muted">
        <Icon name="video" size={16} />
        <span className="text-[9px] font-semibold">Raw clip</span>
      </div>
      <Icon name="chevronRight" size={14} className="shrink-0 text-muted" />
      <div className="flex flex-1 items-end justify-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
          <Icon name="grid" size={16} />
        </div>
        <div className="flex h-20 w-10 items-center justify-center rounded-lg bg-primary text-primary-contrast">
          <Icon name="zap" size={16} />
        </div>
        <div className="flex h-9 w-16 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
          <Icon name="video" size={16} />
        </div>
      </div>
    </div>
  );
}

function CalendarMock() {
  return (
    <div className="grid w-full max-w-xs grid-cols-7 gap-1">
      {Array.from({ length: 21 }, (_, i) => (
        <span
          key={i}
          className={`flex h-8 items-center justify-center rounded text-[10px] font-bold ${
            [3, 8, 10, 15, 17].includes(i)
              ? "bg-primary-soft text-primary-deep"
              : i === 9
                ? "bg-primary text-primary-contrast"
                : "bg-page text-muted/60"
          }`}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}
