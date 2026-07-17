import Link from "next/link";
import { notFound } from "next/navigation";
import { PLATFORMS, platformBySlug } from "@/lib/platforms";
import { PlatformIcon } from "@/components/platform-icon";
import { PlanPicker } from "@/components/plan-picker";
import { Icon } from "@/components/icons";

export function generateStaticParams() {
  return PLATFORMS.map((p) => ({ platform: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  const p = platformBySlug(platform);
  return { title: p ? `${p.name} scheduler` : "Not found" };
}

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  const p = platformBySlug(platform);
  if (!p) notFound();

  const types = p.supports
    .map((t) => ({ text: "text posts", image: "images & carousels", video: "video", story: "stories" })[t])
    .join(", ");

  return (
    <>
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <div className="flex justify-center">
          <PlatformIcon id={p.id} size={52} />
        </div>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight">
          Schedule your {p.name} posts
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
          Plan {types} for {p.name} — and send the same content to 9 other platforms
          while you&apos;re at it.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/create-account" className="btn-primary !px-6 !py-3">
            Try it for free
          </Link>
          <Link href="/#pricing" className="btn-subtle !px-6 !py-3">
            See pricing
          </Link>
        </div>
      </section>

      <section className="border-y border-line bg-page py-14">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 md:grid-cols-3">
          {[
            ["send", "Post everywhere", `One upload goes to ${p.name} and every other account you connect.`],
            ["card", "Fair pricing", "Flat plans with unlimited posts — never billed per channel."],
            ["zap", "Just works", "Official APIs, human support, no 40-step setup."],
          ].map(([icon, title, copy]) => (
            <div key={title as string} className="card p-6 text-center">
              <span className="inline-flex text-primary-deep">
                <Icon name={icon as string} size={24} />
              </span>
              <p className="mt-2 font-bold">{title}</p>
              <p className="mt-1 text-sm text-muted">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-extrabold">
          Everything a {p.name} workflow needs
        </h2>
        <ul className="mt-6 flex flex-col gap-3">
          {[
            `Queue slots that auto-fill your ${p.name} calendar`,
            "Per-platform captions when one size doesn't fit all",
            p.id === "tiktok"
              ? "Draft mode, cover timestamps and AIGC labels"
              : p.id === "youtube"
                ? "Title overrides and Shorts-ready publishing"
                : p.id === "pinterest"
                  ? "Pin titles, destination links and board picks"
                  : "Exact-time scheduling in your timezone",
            "Per-post results with share links and error detail",
            ...(p.analytics ? ["Views, likes, comments & shares synced on demand (beta)"] : []),
          ].map((f) => (
            <li key={f} className="card flex items-center gap-3 p-4 text-sm font-medium">
              <span className="text-primary-deep">
                <Icon name="check" size={16} strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-page py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-extrabold">
            And 9 more platforms in the same trip
          </h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {PLATFORMS.filter((x) => x.id !== p.id).map((x) => (
              <Link
                key={x.id}
                href={`/${x.slug}`}
                className="card flex items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:border-primary"
              >
                <PlatformIcon id={x.id} size={16} /> {x.name}
              </Link>
            ))}
          </div>
          <div className="mt-14">
            <PlanPicker mode="marketing" />
          </div>
        </div>
      </section>

      <section className="py-16 text-center">
        <h2 className="text-2xl font-extrabold">Ready when you are</h2>
        <Link href="/create-account" className="btn-primary mt-5 !px-8 !py-3">
          Start scheduling {p.name} posts
        </Link>
      </section>
    </>
  );
}
