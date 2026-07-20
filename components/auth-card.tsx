import Link from "next/link";
import { Logo, LogoMark } from "./logo";
import { AuthForm } from "./auth-form";

const ROUTE_STOPS = [
  { title: "Write once", desc: "One caption, tuned per platform." },
  { title: "Pick a departure", desc: "Schedule it, or drop it in a queue slot." },
  { title: "Arrives everywhere", desc: "Every connected account, on time." },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-page-onboarding">
      {/* Brand rail — the route your content rides */}
      <aside className="hidden w-[380px] shrink-0 flex-col justify-between bg-primary-dark p-10 pb-24 text-white lg:flex">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="text-2xl font-bold tracking-tight">post train</span>
        </Link>
        <ol className="flex flex-col gap-8 border-l border-white/25 pl-6">
          {ROUTE_STOPS.map((stop) => (
            <li key={stop.title} className="relative">
              <span
                aria-hidden
                className="absolute -left-[30px] top-1.5 h-2 w-2 rounded-full bg-white"
              />
              <p className="font-semibold">{stop.title}</p>
              <p className="mt-0.5 text-sm text-white/75">{stop.desc}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-white/60">Write once. Post everywhere.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-center border-b border-line bg-white py-4 lg:hidden">
          <Link href="/">
            <Logo size={26} />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function AuthCard({ mode }: { mode: "signin" | "signup" }) {
  const googleConfigured = !!process.env.GOOGLE_CLIENT_ID;
  return (
    <AuthShell>
      <div className="card p-8">
        <h1 className="text-xl font-bold">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "signin"
            ? "Sign in to keep your posting streak going."
            : "Start cross-posting in under two minutes."}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a
            href={googleConfigured ? "/api/auth/google" : undefined}
            aria-disabled={!googleConfigured}
            title={
              googleConfigured
                ? "Continue with Google"
                : "Google OAuth isn't configured in this build — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
            }
            className={`btn-subtle w-full ${googleConfigured ? "" : "cursor-not-allowed opacity-50"}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </a>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <AuthForm mode={mode} />
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <Link href="/create-account" className="font-semibold text-primary-deep">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/signin" className="font-semibold text-primary-deep">
              Sign in
            </Link>
          </>
        )}
      </p>
    </AuthShell>
  );
}
