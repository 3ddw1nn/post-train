import Link from "next/link";
import { CONNECT_ERRORS, PLATFORMS, type PlatformId } from "@/lib/platforms";
import { Icon } from "./icons";
import { Pill } from "./ui";
import { AccountAvatar, PlatformIcon } from "./platform-icon";
import { PreviewPostMenu } from "./preview-post-menu";

const PLANS_HREF = "/dashboard/settings/plans";

function mockAvatar(name: string, bg: string, fg = "ffffff") {
  const initials = name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="28" fill="#${bg}"/><circle cx="30" cy="30" r="15" fill="#${fg}" opacity=".22"/><circle cx="68" cy="66" r="22" fill="#${fg}" opacity=".16"/><text x="48" y="57" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="800" fill="#${fg}">${initials || "PT"}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEMO_POSTS = [
  {
    caption: "Launch teaser cutdown for every social channel",
    accounts: ["tiktok", "instagram", "youtube", "threads"],
    status: "scheduled",
    when: "Today, 11:00 AM",
    icon: "video",
    detail: "Queued from batch scheduler",
  },
  {
    caption: "Product walkthrough clip for launch week",
    accounts: ["instagram", "tiktok", "facebook", "pinterest"],
    status: "scheduled",
    when: "Tomorrow, 9:30 AM",
    icon: "video",
    detail: "Using your posting queue",
  },
  {
    caption: "Customer proof thread with short clips",
    accounts: ["twitter", "linkedin", "bluesky", "mastodon"],
    status: "scheduled",
    when: "Thu, 1:15 PM",
    icon: "type",
    detail: "Thread copied across text-first channels",
  },
  {
    caption: "Local promo update for weekend traffic",
    accounts: ["google_business", "facebook", "instagram"],
    status: "scheduled",
    when: "Fri, 8:45 AM",
    icon: "image",
    detail: "Scheduled for local discovery",
  },
  {
    caption: "Carousel: 5 ways to repurpose one long-form clip",
    accounts: ["instagram", "linkedin", "threads"],
    status: "draft",
    when: "Needs schedule",
    icon: "image",
    detail: "Caption saved, no publish time yet",
  },
  {
    caption: "Behind-the-scenes photo set",
    accounts: ["instagram", "facebook", "pinterest", "google_business"],
    status: "draft",
    when: "Waiting for media",
    icon: "image",
    detail: "Finish uploads before scheduling",
  },
  {
    caption: "Short-form hook variations for A/B testing",
    accounts: ["tiktok", "youtube", "instagram"],
    status: "draft",
    when: "Caption variants ready",
    icon: "video",
    detail: "Pick the strongest hook",
  },
  {
    caption: "Partner announcement copy",
    accounts: ["linkedin", "twitter", "facebook", "mastodon"],
    status: "draft",
    when: "Needs approval",
    icon: "type",
    detail: "Waiting on final partner quote",
  },
  {
    caption: "Founder update with product screenshots",
    accounts: ["twitter", "linkedin", "bluesky"],
    status: "posted",
    when: "Yesterday, 2:30 PM",
    icon: "send",
    detail: "3/3 platforms published",
  },
  {
    caption: "Weekly recap with performance highlights",
    accounts: ["youtube", "tiktok", "instagram"],
    status: "posted",
    when: "Mon, 4:00 PM",
    icon: "send",
    detail: "128.4K total views",
  },
  {
    caption: "Customer story reel and stills",
    accounts: ["instagram", "facebook", "pinterest", "threads"],
    status: "posted",
    when: "Sun, 6:00 PM",
    icon: "send",
    detail: "4/4 platforms published",
  },
  {
    caption: "Community question for the week",
    accounts: ["twitter", "bluesky", "mastodon", "linkedin"],
    status: "posted",
    when: "Sat, 10:20 AM",
    icon: "send",
    detail: "Replies synced into analytics",
  },
] as const;

const DEMO_STATUS_LABEL: Record<(typeof DEMO_POSTS)[number]["status"], string> = {
  scheduled: "Scheduled",
  draft: "Draft",
  posted: "Posted",
};

const DEMO_ANALYTICS = [
  { label: "Views", value: "412.8K", icon: "eye" },
  { label: "Likes", value: "28.9K", icon: "sparkles" },
  { label: "Comments", value: "2.4K", icon: "chat" },
  { label: "Shares", value: "7.8K", icon: "send" },
] as const;

const DEMO_PLATFORM_ROWS = [
  { platform: "tiktok", label: "TikTok", posts: 18, views: "142.1K" },
  { platform: "instagram", label: "Instagram", posts: 16, views: "96.4K" },
  { platform: "youtube", label: "YouTube", posts: 9, views: "61.8K" },
  { platform: "twitter", label: "Twitter/X", posts: 22, views: "38.2K" },
  { platform: "linkedin", label: "LinkedIn", posts: 14, views: "28.9K" },
  { platform: "facebook", label: "Facebook", posts: 13, views: "21.5K" },
  { platform: "threads", label: "Threads", posts: 19, views: "12.8K" },
  { platform: "bluesky", label: "Bluesky", posts: 11, views: "5.7K" },
  { platform: "pinterest", label: "Pinterest", posts: 8, views: "4.9K" },
  { platform: "google_business", label: "Google Business", posts: 6, views: "820" },
  { platform: "mastodon", label: "Mastodon", posts: 7, views: "690" },
] as const;

const DEMO_ANALYTICS_POSTS = [
  ["Launch teaser cutdown", "tiktok", "84.2K", "7.1K", "612", "1.8K", "Today"],
  ["Product walkthrough clip", "instagram", "62.7K", "5.8K", "344", "980", "Today"],
  ["Founder update", "youtube", "48.4K", "3.6K", "253", "604", "Yesterday"],
  ["Customer proof thread", "twitter", "28.2K", "1.9K", "188", "420", "Yesterday"],
  ["Partner announcement", "linkedin", "19.8K", "1.1K", "96", "180", "Mon"],
  ["Customer story reel", "facebook", "15.3K", "870", "71", "132", "Mon"],
  ["Community question", "threads", "9.8K", "640", "88", "210", "Sun"],
  ["Weekend promo pin", "pinterest", "4.9K", "310", "22", "96", "Sun"],
] as const;

const DEMO_CALENDAR_POSTS = [
  { slot: 3, icon: "video", label: "9:00 Launch teaser", accounts: ["tiktok", "instagram", "youtube"] },
  { slot: 4, icon: "image", label: "11:30 Carousel", accounts: ["instagram", "linkedin", "threads"] },
  { slot: 5, icon: "type", label: "2:00 Proof thread", accounts: ["twitter", "bluesky", "mastodon"] },
  { slot: 8, icon: "video", label: "10:00 Walkthrough", accounts: ["tiktok", "youtube"] },
  { slot: 9, icon: "image", label: "1:15 Local promo", accounts: ["google_business", "facebook"] },
  { slot: 11, icon: "send", label: "4:00 Partner post", accounts: ["linkedin", "twitter"] },
  { slot: 12, icon: "image", label: "8:45 Pin set", accounts: ["pinterest", "instagram"] },
  { slot: 15, icon: "video", label: "12:00 Weekly recap", accounts: ["youtube", "tiktok", "instagram"] },
  { slot: 16, icon: "type", label: "3:30 Community Q", accounts: ["threads", "bluesky"] },
  { slot: 18, icon: "image", label: "9:15 BTS photos", accounts: ["facebook", "pinterest"] },
  { slot: 19, icon: "video", label: "2:45 Customer reel", accounts: ["instagram", "facebook", "threads"] },
  { slot: 22, icon: "video", label: "11:00 Batch drop", accounts: ["tiktok", "youtube"] },
  { slot: 23, icon: "type", label: "1:30 Founder note", accounts: ["linkedin", "mastodon"] },
  { slot: 25, icon: "image", label: "5:00 Promo graphic", accounts: ["google_business", "facebook", "instagram"] },
  { slot: 29, icon: "send", label: "10:30 Roundup", accounts: ["twitter", "linkedin", "bluesky"] },
] as const;

type DemoCalendarPost = (typeof DEMO_CALENDAR_POSTS)[number];

const DEMO_CONNECTIONS: {
  id: number;
  platform: PlatformId;
  username: string;
  status: "active" | "needs_reauth";
  avatar_url: string;
}[] = [
  { id: 1024, platform: "tiktok", username: "posttrainhq", status: "active", avatar_url: mockAvatar("PT", "0f766e") },
  { id: 1025, platform: "tiktok", username: "clips.daily", status: "active", avatar_url: mockAvatar("CD", "111827") },
  { id: 1030, platform: "instagram", username: "posttrain.studio", status: "active", avatar_url: mockAvatar("PS", "be185d") },
  { id: 1031, platform: "instagram", username: "founder.notes", status: "needs_reauth", avatar_url: mockAvatar("FN", "db2777") },
  { id: 1040, platform: "youtube", username: "Post Train Shorts", status: "active", avatar_url: mockAvatar("YT", "dc2626") },
  { id: 1050, platform: "twitter", username: "posttrain", status: "active", avatar_url: mockAvatar("X", "111827") },
  { id: 1060, platform: "linkedin", username: "post-train", status: "active", avatar_url: mockAvatar("LI", "0369a1") },
  { id: 1070, platform: "facebook", username: "Post Train", status: "active", avatar_url: mockAvatar("FB", "1d4ed8") },
  { id: 1080, platform: "threads", username: "posttrain", status: "active", avatar_url: mockAvatar("TH", "171717") },
  { id: 1090, platform: "bluesky", username: "posttrain.bsky.social", status: "active", avatar_url: mockAvatar("BS", "0284c7") },
  { id: 1100, platform: "pinterest", username: "posttrainideas", status: "active", avatar_url: mockAvatar("PI", "be123c") },
  { id: 1110, platform: "google_business", username: "Post Train Studio", status: "needs_reauth", avatar_url: mockAvatar("GB", "16a34a") },
  { id: 1120, platform: "mastodon", username: "posttrain@mastodon.social", status: "active", avatar_url: mockAvatar("MA", "6366f1") },
] as const;

const DEMO_TEAMS = [
  {
    name: "Launch Crew",
    role: "You manage this",
    members: [
      { name: "John M Doe", label: "owner", avatar: mockAvatar("John M Doe", "0f766e") },
      { name: "Maya Chen", label: "manager", avatar: mockAvatar("Maya Chen", "2563eb") },
      { name: "Andre Blake", label: "member", avatar: mockAvatar("Andre Blake", "7c3aed") },
      { name: "sam@posttrain.co", label: "invite pending", avatar: mockAvatar("Sam", "d97706") },
    ],
  },
  {
    name: "Content Ops",
    role: "Shared workspace",
    members: [
      { name: "Priya Shah", label: "owner", avatar: mockAvatar("Priya Shah", "be185d") },
      { name: "John M Doe", label: "manager", avatar: mockAvatar("John M Doe", "0f766e") },
      { name: "Eli Morgan", label: "member", avatar: mockAvatar("Eli Morgan", "0891b2") },
      { name: "noah@agency.com", label: "invite pending", avatar: mockAvatar("Noah", "475569") },
    ],
  },
  {
    name: "Client Review",
    role: "Approval flow",
    members: [
      { name: "Nina Park", label: "owner", avatar: mockAvatar("Nina Park", "059669") },
      { name: "Owen Reed", label: "member", avatar: mockAvatar("Owen Reed", "9333ea") },
      { name: "client@brand.com", label: "invite pending", avatar: mockAvatar("Client", "ea580c") },
    ],
  },
] as const;

export function PreviewBanner({ feature }: { feature: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-left">
      <div>
        <p className="text-sm font-bold text-primary-dark">Preview mode</p>
        <p className="text-sm text-primary-dark/80">
          This is sample {feature} data so you can see how the workspace looks after subscribing.
        </p>
      </div>
      <Link href="/dashboard/settings/plans" className="btn-primary shrink-0 !py-1.5">
        Subscribe
      </Link>
    </div>
  );
}

export function DemoPostsList({ filter }: { filter: "all" | "scheduled" | "posted" | "draft" }) {
  const posts =
    filter === "all" ? DEMO_POSTS : DEMO_POSTS.filter((post) => post.status === filter);

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <div key={post.caption} className="card p-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-page text-muted">
              <Icon name={post.icon} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{post.caption}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  {post.accounts.map((id) => (
                    <PlatformIcon key={id} id={id} size={22} />
                  ))}
                </span>
                <span className="text-xs text-muted">{post.detail}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="pill bg-primary-soft text-primary-deep">
                {DEMO_STATUS_LABEL[post.status]}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Icon name="clock" size={12} /> {post.when}
              </span>
            </div>
            <PreviewPostMenu editable={post.status !== "posted"} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DemoCalendarGrid({
  days,
  activeMonth,
  view,
  todayYmd,
}: {
  days: { y: number; m: number; d: number }[];
  activeMonth: number;
  view: "month" | "week";
  todayYmd?: string;
}) {
  const demoByIndex = new Map<number, DemoCalendarPost[]>();
  for (const post of DEMO_CALENDAR_POSTS) {
    demoByIndex.set(post.slot, [...(demoByIndex.get(post.slot) ?? []), post]);
  }
  const compareToday =
    todayYmd ??
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(
      new Date().getDate()
    ).padStart(2, "0")}`;

  return (
    <>
      {days.map((day, i) => {
        const muted = view === "month" && day.m !== activeMonth;
        const dateStr = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
        const isToday = dateStr === compareToday;
        const isPastDay = dateStr < compareToday;
        const demoPosts = demoByIndex.get(i) ?? [];
        return (
          <div
            key={`${day.y}-${day.m}-${day.d}`}
            className={`group relative border-b border-r border-line p-1.5 ${
              view === "month" ? "min-h-[113px]" : "min-h-[486px]"
            } ${
              isToday
                ? "z-10 bg-primary-soft/70 ring-2 ring-inset ring-primary/60"
                : isPastDay
                  ? "bg-gray-100/90"
                  : muted
                    ? "bg-page/40"
                    : "bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    isToday
                      ? "bg-primary text-primary-contrast"
                      : muted || isPastDay
                        ? "text-muted/60"
                        : ""
                  }`}
                >
                  {day.d}
                </span>
                {isToday && (
                  <span className="rounded-full border border-primary/25 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-primary-deep">
                    Today
                  </span>
                )}
              </span>
            </div>
            {demoPosts.length === 0 ? (
              <p className="mt-2 text-center text-[10px] text-muted/50">No posts</p>
            ) : (
              <div className="mt-1 flex flex-col gap-1">
                {demoPosts.slice(0, view === "month" ? 3 : 20).map((post) => (
                  <Link
                    key={post.label}
                    href={PLANS_HREF}
                    className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-1.5 py-1 text-[11px] shadow-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-page text-muted">
                      <Icon name={post.icon} size={11} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted">{post.label}</span>
                    <span className="hidden shrink-0 items-center gap-1 sm:flex">
                      {post.accounts.slice(0, 2).map((id) => (
                        <PlatformIcon key={id} id={id} size={12} />
                      ))}
                    </span>
                  </Link>
                ))}
                {view === "month" && demoPosts.length > 3 && (
                  <p className="text-center text-[10px] font-semibold text-muted">
                    +{demoPosts.length - 3} more
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function DemoConnectionsPanel({ error }: { error?: string | null }) {
  const stale = DEMO_CONNECTIONS.filter((account) => account.status === "needs_reauth");
  const used = DEMO_CONNECTIONS.length;
  const cap = 50;

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="mt-1 text-sm text-muted">
            Every account your posts can depart to.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {used} <span className="font-medium text-muted">of {cap} accounts</span>
          </p>
          <div className="mt-1.5 h-1 w-36 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (used / cap) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <PreviewBanner feature="connections" />

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {CONNECT_ERRORS[error] ?? "Something went wrong connecting that account — try again."}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-warning-bg px-4 py-3">
        <p className="text-sm font-bold text-warning-ink">
          {stale.length} accounts need re-authentication:
        </p>
        {stale.map((account) => (
          <Link key={account.id} href={PLANS_HREF} className="btn-warning !py-1.5 text-xs">
            <Icon name="refresh" size={13} /> Refresh @
            {account.username}
          </Link>
        ))}
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page/50 px-4 py-2.5">
          <div className="flex items-center gap-1 text-muted">
            <Icon name="filter" size={14} />
            <Link
              href={PLANS_HREF}
              className="input w-auto !border-0 !bg-transparent !py-1 text-xs font-semibold"
              aria-label="Filter platforms"
            >
              All platforms
            </Link>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            Show IDs
            <Link
              href={PLANS_HREF}
              role="switch"
              aria-checked="false"
              className="pt-toggle scale-90"
              data-on={false}
            >
              <span />
            </Link>
          </label>
        </div>

        <div className="flex flex-col divide-y divide-line">
          {PLATFORMS.map((platform) => {
            const rows = DEMO_CONNECTIONS.filter((account) => account.platform === platform.id);
            return (
              <div key={platform.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex w-32 shrink-0 items-center gap-2.5">
                  <PlatformIcon id={platform.id} size={20} />
                  <span className="text-sm font-semibold">{platform.name}</span>
                </div>
                <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
                  {rows.map((account) => (
                    <span
                      key={account.id}
                      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-1.5 text-xs font-semibold ${
                        account.status === "needs_reauth"
                          ? "border-amber-300 bg-amber-50"
                          : "border-line bg-white"
                      }`}
                    >
                      <AccountAvatar
                        username={account.username}
                        platformId={account.platform}
                        avatarUrl={account.avatar_url}
                        size={22}
                      />
                      @{account.username}
                      <Link
                        href={PLANS_HREF}
                        className="text-muted hover:text-danger"
                        title="Remove account"
                      >
                        <Icon name="x" size={12} strokeWidth={3} />
                      </Link>
                    </span>
                  ))}
                </div>
                <Link
                  href={PLANS_HREF}
                  aria-label={`Connect ${platform.name}`}
                  className="btn-dark order-2 ml-auto shrink-0 !py-1.5 text-xs sm:order-none"
                >
                  <Icon name="plus" size={13} strokeWidth={2.5} /> Connect
                </Link>
              </div>
            );
          })}
        </div>

        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Trouble linking something?{" "}
          <Link href={PLANS_HREF} className="font-semibold text-primary-deep hover:underline">
            Open the full connections flow
          </Link>
        </p>
      </div>
    </div>
  );
}

function DemoMemberAvatar({ name, src }: { name: string; src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small generated preview avatars
    <img
      src={src}
      alt={name}
      className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-line"
    />
  );
}

export function DemoTeamsPanel() {
  return (
    <div className="fade-up mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="mt-1 text-sm text-muted">
            Share a workspace — everyone posts to the same connected accounts.
          </p>
        </div>
        <Link href={PLANS_HREF} className="btn-primary">
          <Icon name="plus" size={15} /> Create team
        </Link>
      </div>

      <PreviewBanner feature="teams" />

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-bold">My Teams</h2>
        <div className="flex gap-2">
          <Link href={PLANS_HREF} className="btn-subtle !py-1.5 text-xs">
            <Icon name="refresh" size={13} /> Refresh
          </Link>
          <Link href={PLANS_HREF} className="btn-primary !py-1.5 text-xs">
            <Icon name="plus" size={13} /> New team
          </Link>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {DEMO_TEAMS.map((team) => (
          <div key={team.name} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-page/50 px-5 py-3">
              <Icon name="users" size={16} className="text-muted" />
              <p className="text-sm font-bold">{team.name}</p>
              <span className="pill bg-gray-100 text-gray-600">{team.role}</span>
              <span className="ml-auto text-xs font-semibold text-muted">
                {team.members.length} members
              </span>
            </div>
            <div className="flex flex-col divide-y divide-line">
              {team.members.map((member) => (
                <div key={`${team.name}-${member.name}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <DemoMemberAvatar name={member.name} src={member.avatar} />
                  <span className="min-w-0 truncate font-medium">{member.name}</span>
                  <span
                    className={`ml-auto text-xs capitalize ${
                      member.label === "invite pending"
                        ? "pill bg-warning-bg !font-semibold text-warning-ink"
                        : "font-semibold text-muted"
                    }`}
                  >
                    {member.label}
                  </span>
                  {member.label !== "owner" && member.label !== "invite pending" && (
                    <Link href={PLANS_HREF} className="btn-subtle !px-2 !py-1 text-xs">
                      Manage
                    </Link>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-line px-5 py-3">
              <div className="flex flex-wrap gap-2">
                <div className="input min-w-0 flex-1 text-sm text-muted">
                  teammate@company.com
                </div>
                <Link href={PLANS_HREF} className="btn-primary !py-2 text-sm">
                  <Icon name="mail" size={14} /> Invite
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoAnalytics({ tab }: { tab: "overview" | "posts" }) {
  if (tab === "posts") {
    return (
      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold text-muted">
              <th className="px-4 py-3">Post</th>
              <th className="px-2 py-3">Platform</th>
              <th className="px-2 py-3 text-right">Views</th>
              <th className="px-2 py-3 text-right">Likes</th>
              <th className="px-2 py-3 text-right">Comments</th>
              <th className="px-2 py-3 text-right">Shares</th>
              <th className="px-2 py-3">Synced</th>
              <th className="px-2 py-3">Match</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_ANALYTICS_POSTS.map(([title, platform, views, likes, comments, shares, synced]) => (
              <tr key={title} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-medium">{title}</td>
                <td className="px-2 py-2.5">
                  <PlatformIcon id={platform} size={16} />
                </td>
                <td className="px-2 py-2.5 text-right font-semibold">{views}</td>
                <td className="px-2 py-2.5 text-right">{likes}</td>
                <td className="px-2 py-2.5 text-right">{comments}</td>
                <td className="px-2 py-2.5 text-right">{shares}</td>
                <td className="px-2 py-2.5 text-xs text-muted">{synced}</td>
                <td className="px-2 py-2.5">
                  <Pill tone="success">high</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
        {DEMO_ANALYTICS.map((stat) => (
          <div key={stat.label} className="px-5 py-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted">
              <Icon name={stat.icon} size={13} /> {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-5 py-4">
        <h2 className="font-bold">By platform</h2>
        <div className="mt-2 flex flex-col divide-y divide-line">
          {DEMO_PLATFORM_ROWS.map((row) => (
            <div key={row.platform} className="flex items-center gap-3 py-3">
              <PlatformIcon id={row.platform} size={20} />
              <span className="font-semibold">{row.label}</span>
              <span className="text-sm text-muted">{row.posts} tracked posts</span>
              <span className="ml-auto font-bold tabular-nums">{row.views} views</span>
              <Link href={PLANS_HREF} className="btn-subtle !py-1.5 text-xs opacity-60">
                Sync
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
