const LOGO_MARK_ASPECT = 1084 / 588;

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/logo-main.svg"
      width={size * LOGO_MARK_ASPECT}
      height={size}
      alt=""
      aria-hidden
    />
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-2xl font-bold tracking-tight text-ink">
        post train
      </span>
    </span>
  );
}
