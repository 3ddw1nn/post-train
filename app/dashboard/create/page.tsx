import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { canCreatePosts } from "@/lib/entitlements";
import { platformsForType, type PostType } from "@/lib/platforms";
import { PlatformIconRow } from "@/components/platform-icon";
import { Icon } from "@/components/icons";
import { PaywallCard } from "@/components/paywall-card";

export const metadata = { title: "Create a new post" };

const TYPES: { type: PostType; title: string; icon: string; desc: string }[] = [
  { type: "text", title: "Text Post", icon: "type", desc: "Words only — threads, updates, notes" },
  { type: "image", title: "Image Post", icon: "image", desc: "Single image or carousel" },
  { type: "video", title: "Video Post", icon: "video", desc: "Short-form video everywhere" },
  { type: "story", title: "Story Post", icon: "zap", desc: "24-hour stories" },
];

export default async function CreateHub({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { date } = await searchParams;
  const dateQ = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : "";
  const sub = await getSubscription(user.id);
  if (!canCreatePosts(sub, user)) return <PaywallCard />;

  return (
    <div className="fade-up mx-auto max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Create a new post</h1>
          <p className="mt-1 text-sm text-muted">Pick a format, then choose where it ships.</p>
        </div>
      </div>

      <div className="card mt-6 divide-y divide-line overflow-hidden">
        {TYPES.map((t) => (
          <Link
            key={t.type}
            href={`/dashboard/create/${t.type}${dateQ}`}
            className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-primary-soft"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-page text-ink transition-colors duration-150 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-contrast">
              <Icon name={t.icon} size={22} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold">{t.title}</span>
                <span className="text-xs text-muted">{t.desc}</span>
              </span>
              <span className="mt-1.5 block">
                <PlatformIconRow ids={platformsForType(t.type).map((p) => p.id)} size={14} />
              </span>
            </span>
            <Icon
              name="chevronRight"
              size={16}
              className="shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary-deep"
            />
          </Link>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-sm text-muted">
        <Icon name="info" size={14} className="shrink-0" />
        <span>
          Missing an account?{" "}
          <Link href="/dashboard/connections" className="font-semibold text-primary-deep hover:underline">
            Connect more here
          </Link>
        </span>
      </div>
    </div>
  );
}
