import Link from "next/link";

/** Sticky wizard footer: Back link + Next button (spec 03 §C). */
export function FooterBar({
  backHref,
  next,
}: {
  backHref?: string;
  next?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        {backHref ? (
          <Link href={backHref} className="btn-subtle">
            Back
          </Link>
        ) : (
          <span />
        )}
        {next ?? <span />}
      </div>
    </div>
  );
}
