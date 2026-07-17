import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { PlatformIconRow } from "@/components/platform-icon";
import { Icon } from "@/components/icons";
import { platformsForType } from "@/lib/platforms";

export const metadata = { title: "Bulk tools" };

export default async function BulkToolsPage() {
  await requireOnboardedUser();
  const videoPlatforms = platformsForType("video").map((p) => p.id);
  const imagePlatforms = platformsForType("image").map((p) => p.id);

  const cards = [
    {
      href: "/dashboard/bulk-tools/videos",
      icons: ["video", "stack"],
      title: "Bulk Video Upload",
      desc: "Upload and schedule multiple videos at once",
      platforms: videoPlatforms,
    },
    {
      href: "/dashboard/bulk-tools/images",
      icons: ["image", "stack"],
      title: "Bulk Image Upload",
      desc: "Upload and schedule multiple images at once",
      platforms: imagePlatforms,
    },
    {
      href: "/dashboard/bulk-tools/creation",
      icons: ["grid", "sparkles"],
      title: "Bulk Video Creation",
      desc: "Create viral 2x2 grid videos in bulk (AI assisted)",
      platforms: ["facebook", "threads", "bluesky"],
    },
  ];

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Bulk tools</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-white p-8 text-center transition-colors hover:border-primary"
          >
            <span className="flex gap-2 text-muted transition-colors group-hover:text-primary-deep">
              {c.icons.map((i) => (
                <Icon key={i} name={i} size={28} />
              ))}
            </span>
            <span className="flex items-center gap-2 font-bold">
              {c.title} <span className="pill bg-primary-soft text-primary-deep">NEW</span>
            </span>
            <span className="text-xs text-muted">{c.desc}</span>
            <PlatformIconRow ids={c.platforms} size={13} />
          </Link>
        ))}
      </div>
    </div>
  );
}
