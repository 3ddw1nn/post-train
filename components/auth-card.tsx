import Link from "next/link";
import { Logo } from "./logo";
import { AuthForm } from "./auth-form";

export function AuthCard({ mode }: { mode: "signin" | "signup" }) {
  const googleConfigured = !!process.env.GOOGLE_CLIENT_ID;
  return (
    <main className="flex min-h-screen items-center justify-center bg-page-onboarding px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex justify-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <h1 className="mt-6 text-center text-xl font-bold">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
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
      </div>
    </main>
  );
}
