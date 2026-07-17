import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";

export const metadata = { title: "Bulk Video Creation" };

export default async function BulkCreationPage() {
  await requireOnboardedUser();
  return (
    <div className="fade-up mx-auto max-w-xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        Bulk Video Creation <Pill tone="beta">Beta</Pill>
      </h1>
      <div className="card mt-5 flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex gap-2 text-muted">
          <Icon name="grid" size={30} />
          <Icon name="sparkles" size={30} />
        </span>
        <p className="font-bold">Compose 2x2 grid videos at volume</p>
        <p className="text-sm text-muted">
          This tool builds batches of grid videos from your clips using the Content Studio
          renderer, then drops them straight into Bulk Video Scheduling. Start from the
          studio template to compose one, or bulk-schedule ready-made videos now.
        </p>
        <div className="mt-2 flex gap-2">
          <Link href="/dashboard/content-studio" className="btn-primary">
            Open Content Studio
          </Link>
          <Link href="/dashboard/bulk-tools/videos" className="btn-subtle">
            Bulk Video Upload
          </Link>
        </div>
      </div>
    </div>
  );
}
