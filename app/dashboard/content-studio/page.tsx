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
    tag: "Trending",
    icon: "grid",
  },
  {
    id: "fade-in",
    title: "Single Fade-in Video",
    desc: "One clip with a clean fade-in and caption overlay. Simple, fast, effective.",
    tag: null,
    icon: "video",
  },
  {
    id: "ai-ugc",
    title: "AI UGC Creator",
    desc: "Pick a persona, add your hook text and CTA clip — ship UGC-style videos at volume.",
    tag: "Most used",
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

        {/* Featured banner — content left, action anchored right */}
        <div className="mt-5 flex flex-col gap-4 rounded-2xl border-2 border-primary bg-primary-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill bg-primary text-primary-contrast">New</span>
              <span className="pill bg-white text-primary-deep">AI-powered</span>
            </div>
            <h2 className="mt-2 text-xl font-bold">AI UGC Video Creator</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Turn a persona clip, a hook and your product shot into ready-to-post UGC
              videos — no filming, no editors, no waiting.
            </p>
          </div>
          <Link
            href={unlocked ? "/dashboard/content-studio/ai-ugc" : "/dashboard/settings/plans"}
            className="btn-primary shrink-0"
          >
            {unlocked ? "Try AI UGC Creator" : "Upgrade to use"}
          </Link>
        </div>

        {/* Template list — a row per template, not a card grid */}
        <div className="mt-5 flex flex-col divide-y divide-line rounded-xl border border-line">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
                <Icon name={t.icon} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{t.title}</h3>
                  {t.tag && <span className="pill bg-page text-muted">{t.tag}</span>}
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
