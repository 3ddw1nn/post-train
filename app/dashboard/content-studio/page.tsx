import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { Icon } from "@/components/icons";
import { StudioJobsList } from "@/components/studio";

export const metadata = { title: "Content Studio" };

const TEMPLATES = [
  {
    id: "grid-2x2",
    title: "2x2 Grid Video",
    desc: "Four clips playing in a satisfying grid — a proven short-form format.",
    badges: ["🔥 Trending", "📊 500M+ views"],
    icon: "grid",
  },
  {
    id: "fade-in",
    title: "Single Fade-in Video",
    desc: "One clip with a clean fade-in and caption overlay. Simple, fast, effective.",
    badges: ["📊 20M+ views"],
    icon: "video",
  },
  {
    id: "ai-ugc",
    title: "AI UGC Creator",
    desc: "Pick a persona, add your hook text and CTA clip — ship UGC-style videos at volume.",
    badges: ["🔥 SUPER HOT", "📊 1B+ views"],
    icon: "sparkles",
  },
];

export default async function StudioPage() {
  const user = await requireOnboardedUser();
  const sub = await getSubscription(user.id);
  const unlocked = studioAccess(sub);

  return (
    <div className="fade-up">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Content Studio</h1>

        {/* Featured banner */}
        <div className="mt-5 rounded-2xl border-2 border-primary bg-primary-soft p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-primary text-primary-contrast">NEW</span>
            <span className="pill bg-violet-100 text-violet-700">AI-Powered</span>
          </div>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold">
            ✨ AI UGC Video Creator
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Turn a persona clip, a hook and your product shot into ready-to-post UGC
            videos — no filming, no editors, no waiting.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-muted">
            <span>🔥 SUPER HOT</span>
            <span>📊 Infinite views</span>
          </div>
          <Link
            href={unlocked ? "/dashboard/content-studio/ai-ugc" : "/dashboard/settings/plans"}
            className="btn-primary mt-4"
          >
            {unlocked ? "Try AI UGC Creator" : "Upgrade to Use"}
          </Link>
        </div>

        {/* Template grid */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="card relative flex flex-col p-5">
              {!unlocked && (
                <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                  <Icon name="lock" size={13} />
                </span>
              )}
              <span className="text-muted">
                <Icon name={t.icon} size={28} />
              </span>
              <h3 className="mt-3 font-bold">{t.title}</h3>
              <p className="mt-1 text-sm text-muted">{t.desc}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-muted">
                {t.badges.map((b) => (
                  <span key={b}>{b}</span>
                ))}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-4">
                {unlocked ? (
                  <Link
                    href={`/dashboard/content-studio/${t.id}`}
                    className="btn-primary flex-1 !py-1.5"
                  >
                    Use Template
                  </Link>
                ) : (
                  <Link
                    href="/dashboard/settings/plans"
                    className="btn-subtle flex-1 !py-1.5"
                  >
                    Upgrade to Use
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
