import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PLATFORMS, connectHref } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icons";

export const metadata = { title: "Add your accounts" };

export default async function OnboardingConnectAdd() {
  await requireUser();
  const grid = PLATFORMS.filter((p) => p.onboardingGrid);
  return (
    <div className="fade-up mx-auto max-w-2xl">
      <Link
        href="/onboarding/connect"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <Icon name="chevronLeft" size={15} /> Back
      </Link>
      <h1 className="text-2xl font-bold">Add all your accounts</h1>
      <p className="mt-1 text-sm text-muted">
        Connect with each platform&apos;s official sign-in. We never see or store your
        passwords.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {grid.map((p) => (
          <div key={p.id} className="card flex flex-col items-center gap-3 p-5">
            <PlatformIcon id={p.id} size={30} />
            <p className="text-sm font-semibold">{p.name}</p>
            <a
              href={connectHref(p.id, { returnTo: "/onboarding/connect" })}
              className="btn-primary w-full !py-1.5"
            >
              Add
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
