import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { platform as platformOf } from "@/lib/platforms";
import { recordById } from "@/lib/db";
import { PlatformIcon } from "@/components/platform-icon";
import { LogoMark } from "@/components/logo";
import { ConsentForm } from "./consent-form";
import { BlueskyForm } from "./bluesky-form";
import { MastodonForm } from "./mastodon-form";

export const metadata = { title: "Authorize" };

// Simulated third-party OAuth consent screen. ponytail: this page stands in for
// each platform's real OAuth dialog — the return leg (create/refresh a
// social_accounts row, bounce back to `return`) is exactly what a real callback
// handler does after token exchange.
export default async function MockOAuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string }>;
  searchParams: Promise<{ return?: string; reconnect?: string }>;
}) {
  const user = await requireUser();
  const { platform } = await params;
  const q = await searchParams;
  const p = platformOf(platform);
  if (!p) notFound();

  let existingUsername = "";
  if (q.reconnect) {
    const row = await recordById<{ username: string }>("social_accounts", Number(q.reconnect));
    existingUsername = row?.username ?? "";
  }
  const suggestion =
    existingUsername ||
    (user.display_name || user.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_.]/g, "");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f0f2f5] px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex items-center justify-center gap-4">
          <PlatformIcon id={p.id} size={40} />
          <span className="text-2xl text-muted">⇄</span>
          <LogoMark size={40} />
        </div>
        <h1 className="mt-5 text-center text-lg font-bold">
          Authorize Post Train to access your {p.name} account?
        </h1>
        {p.id === "bluesky" ? (
          <>
            <p className="mt-2 text-center text-xs text-muted">
              Sign in with a Bluesky app password. Your post goes out for real.
            </p>
            <BlueskyForm
              suggestion={existingUsername}
              returnTo={q.return ?? "/dashboard/connections"}
            />
          </>
        ) : p.id === "mastodon" ? (
          <>
            <p className="mt-2 text-center text-xs text-muted">
              Mastodon is federated — tell us which server your account is on. Your post
              goes out for real.
            </p>
            <MastodonForm returnTo={q.return ?? "/dashboard/connections"} reconnect={q.reconnect} />
          </>
        ) : (
          <>
            <p className="mt-2 text-center text-xs text-muted">
              Simulated {p.name} consent screen — in production this is {p.name}&apos;s own
              OAuth dialog. Post Train only ever uses official platform sign-in and never
              sees your password.
            </p>
            <ConsentForm
              platform={p.id}
              platformName={p.name}
              suggestion={suggestion}
              returnTo={q.return ?? "/dashboard/connections"}
              reconnect={q.reconnect}
            />
          </>
        )}
      </div>
    </main>
  );
}
