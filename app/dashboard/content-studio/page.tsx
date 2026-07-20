import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { Icon } from "@/components/icons";
import { StudioJobsList } from "@/components/studio";

export const metadata = { title: "Content Studio" };

const TEMPLATES = [
  {
    id: "ai-ugc",
    title: "AI UGC Creator",
    desc: "Pick a persona, add your hook text and CTA clip — ship UGC-style videos at volume.",
    tags: ["AI-powered"],
    icon: "sparkles",
    featured: true,
  },
  {
    id: "grid-2x2",
    title: "2x2 Grid Video",
    desc: "Four clips playing in a satisfying grid — a proven short-form format.",
    tags: ["Trending"],
    icon: "grid",
  },
  {
    id: "fade-in",
    title: "Single Fade-in Video",
    desc: "One clip with a clean fade-in and caption overlay. Simple, fast, effective.",
    tags: [],
    icon: "video",
  },
];

export default async function StudioPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const unlocked = studioAccess(sub);

  return (
    <div className="fade-up">
      <div className="card p-6">
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-bold">Content Studio</h1>
          <p className="text-sm text-muted">
            Pick a template to start — from quick clip edits to full AI-generated UGC.
          </p>
        </div>

        {/* Featured banner */}
        <div className="mt-5 rounded-xl border border-line bg-primary-soft/30 p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pill bg-primary-soft text-primary-deep">Studio</span>
            <span className="pill bg-primary-soft text-primary-deep">Multi-platform</span>
          </div>
          <h2 className="mt-1.5 text-lg font-bold text-wrap balance">
            Create a week of content in minutes
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Pick a template, customize in seconds, schedule across all platforms. Your
            content library grows while you sleep.
          </p>
        </div>

        {/* Template list — a row per template, not a card grid */}
        <div className="mt-5 flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 ${
                t.featured ? "bg-primary-soft/50" : ""
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  t.featured
                    ? "bg-primary text-primary-contrast"
                    : "bg-primary-soft text-primary-deep"
                }`}
              >
                <Icon name={t.icon} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{t.title}</h3>
                  {t.featured && (
                    <span className="pill bg-primary text-primary-contrast">Featured</span>
                  )}
                  {t.tags.map((tag) => (
                    <span key={tag} className="pill bg-page text-muted">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-0.5 text-sm text-muted">{t.desc}</p>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                {!unlocked && (
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-page text-muted"
                    title="Requires an upgrade"
                  >
                    <Icon name="lock" size={13} />
                  </span>
                )}
                {unlocked ? (
                  <Link href={`/dashboard/content-studio/${t.id}`} className="btn-primary !py-1.5">
                    Use template
                  </Link>
                ) : (
                  <Link href="/dashboard/settings/plans" className="btn-subtle !py-1.5">
                    Upgrade
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {unlocked && <StudioJobsList />}
      </div>
    </div>
  );
}
