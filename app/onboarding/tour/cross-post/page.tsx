import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icons";

export const metadata = { title: "Post everywhere" };

const SAMPLE = PLATFORMS.slice(0, 6).map((p) => p.id);

export default async function TourCrossPost() {
  await requireUser();
  return (
    <div className="fade-up mx-auto max-w-2xl">
      <Link
        href="/onboarding/goal"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <Icon name="chevronLeft" size={15} /> Back
      </Link>
      <h1 className="text-2xl font-bold">Write once, post everywhere</h1>
      <p className="mt-1 text-sm text-muted">
        Pick every account you own — multiple per platform — and ship the same post to all
        of them at once.
      </p>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-page/50 px-5 py-3">
          <Icon name="send" size={14} className="text-primary-deep" />
          <p className="text-sm font-bold">Create post</p>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {SAMPLE.map((id, i) => (
              <span
                key={id}
                className={`flex h-10 w-10 items-center justify-center rounded-full bg-page ${
                  i < 4 ? "ring-2 ring-primary" : "opacity-40"
                }`}
              >
                <PlatformIcon id={id} size={18} />
              </span>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-page/50 p-3 text-sm text-muted">
            Fresh drop 🚂 — the same post, everywhere your audience lives…
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary-deep">
            <Icon name="check" size={14} /> 4 destinations selected
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Link href="/onboarding/tour/queue" className="btn-primary px-11 py-[18px] text-xl">
          Continue
        </Link>
      </div>
    </div>
  );
}
