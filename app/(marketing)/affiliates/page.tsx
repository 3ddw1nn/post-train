import Link from "next/link";

export const metadata = { title: "Affiliates" };

export default function AffiliatesPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight">Earn 30% forever</h1>
      <p className="mx-auto mt-3 max-w-md text-lg text-muted">
        Refer creators and keep 30% of every payment they make, for as long as they stay.
        The affiliate portal (powered by an external partner in production) opens with
        your account email.
      </p>
      <div className="card mx-auto mt-8 max-w-sm p-6">
        <p className="text-3xl font-extrabold text-primary-deep">30%</p>
        <p className="mt-1 text-sm text-muted">recurring commission · 60-day cookie</p>
        <a
          href="mailto:affiliates@posttrain.example?subject=Affiliate%20signup"
          className="btn-primary mt-4 w-full"
        >
          Request your link
        </a>
      </div>
      <p className="mt-8 text-sm text-muted">
        Not a member yet?{" "}
        <Link href="/create-account" className="font-semibold text-primary-deep">
          Start your free trial
        </Link>
      </p>
    </section>
  );
}
