import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-page px-6 text-center">
      <svg width="220" height="120" viewBox="0 0 220 120" aria-hidden>
        <path d="M0 110 L45 45 L80 90 L115 30 L160 110 Z" fill="#d9edeb" />
        <path d="M90 110 L135 55 L170 85 L200 40 L220 110 Z" fill="#a8d5d0" />
        <circle cx="185" cy="25" r="12" fill="#fde68a" />
        <text
          x="110"
          y="78"
          textAnchor="middle"
          fontSize="40"
          fontWeight="800"
          fill="#1c1c1e"
        >
          404
        </text>
      </svg>
      <h1 className="text-2xl font-bold">This page doesn&apos;t exist 😅</h1>
      <p className="max-w-sm text-sm text-muted">
        The track ends here. Let&apos;s get you back to somewhere useful.
      </p>
      <div className="flex gap-3">
        <Link href="/" className="btn-primary">
          Home
        </Link>
        <a href="mailto:ehleedev@gmail.com" className="btn-subtle">
          Support
        </a>
      </div>
    </main>
  );
}
