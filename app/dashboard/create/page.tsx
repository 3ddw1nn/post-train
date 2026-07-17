import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { canCreatePosts, entitled, freePostsRemaining } from "@/lib/entitlements";
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
  const sub = getSubscription(user.id);
  if (!canCreatePosts(user, sub)) return <PaywallCard />;

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Create a new post</h1>
        {!entitled(sub) && (
          <span className="pill bg-warning-bg text-warning-ink">
            {freePostsRemaining(user)} free post{freePostsRemaining(user) === 1 ? "" : "s"} left
          </span>
        )}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TYPES.map((t) => (
          <Link
            key={t.type}
            href={`/dashboard/create/${t.type}${dateQ}`}
            className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-white p-8 text-center transition-colors hover:border-primary"
          >
            <span className="text-muted transition-colors group-hover:text-primary-deep">
              <Icon name={t.icon} size={34} />
            </span>
            <span className="font-bold">{t.title}</span>
            <span className="text-xs text-muted">{t.desc}</span>
            <PlatformIconRow ids={platformsForType(t.type).map((p) => p.id)} size={14} />
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        Missing an account?{" "}
        <Link href="/dashboard/connections" className="font-semibold text-primary-deep">
          You can connect more accounts here
        </Link>
        .
      </p>
    </div>
  );
}
