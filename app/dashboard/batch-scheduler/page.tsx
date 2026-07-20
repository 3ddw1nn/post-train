import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { PlatformIconRow } from "@/components/platform-icon";
import { Icon } from "@/components/icons";
import { platformsForType } from "@/lib/platforms";

export const metadata = { title: "Batch Scheduler" };

export default async function BulkToolsPage() {
  await requireOnboardedUser();
  const videoPlatforms = platformsForType("video").map((p) => p.id);
  const imagePlatforms = platformsForType("image").map((p) => p.id);

  const tools = [
    {
      href: "/dashboard/batch-scheduler/videos",
      icons: ["video", "stack"],
      title: "Bulk Video Upload",
      desc: "Upload and schedule multiple videos at once",
      platforms: videoPlatforms,
      isNew: true,
    },
    {
      href: "/dashboard/batch-scheduler/images",
      icons: ["image", "stack"],
      title: "Bulk Image Upload",
      desc: "Upload and schedule multiple images at once",
      platforms: imagePlatforms,
      isNew: true,
    },
    {
      href: "/dashboard/batch-scheduler/creation",
      icons: ["grid", "sparkles"],
      title: "Bulk Video Creation",
      desc: "Create viral 2x2 grid videos in bulk (AI assisted)",
      platforms: ["facebook", "threads", "bluesky"],
      isNew: true,
    },
  ];

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Batch Scheduler</h1>

      {/* Benefit highlight banner */}
      <div className="mt-6 rounded-xl border border-line bg-primary-soft/30 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill bg-primary-soft text-primary-deep">Batch operations</span>
        </div>
        <h2 className="mt-1.5 text-lg font-bold text-wrap balance">
          Upload 100+ videos at once, post across every platform automatically
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Skip the repetition. Create content once, schedule it everywhere, and watch your
          reach compound.
        </p>
      </div>

      {/* Tools grid */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {tools.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex flex-col gap-4 rounded-xl border border-line bg-white p-6 transition-all hover:border-primary hover:shadow-[0_8px_16px_rgba(14,129,119,0.08)]"
          >
            <span className="flex gap-2 text-primary-deep transition-colors group-hover:text-primary">
              {t.icons.map((i) => (
                <Icon key={i} name={i} size={32} />
              ))}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-ink">{t.title}</h2>
                {t.isNew && <span className="pill bg-primary-soft text-primary-deep">NEW</span>}
              </div>
              <p className="mt-2 text-sm text-muted">{t.desc}</p>
            </div>
            <div className="flex gap-1 pt-1">
              <PlatformIconRow ids={t.platforms} size={13} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
