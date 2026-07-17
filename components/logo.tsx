export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#66cc8a" />
      {/* stylized rails heading out — "post train" */}
      <path
        d="M7 22.5 L18 11.5 M11.5 25 L22.5 14"
        stroke="#0c2e1a"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M10 16.5l4 4M14 12.5l4 4M18 8.5l4 4"
        stroke="#0c2e1a"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="23.5" cy="23.5" r="3.2" fill="#0c2e1a" />
      <circle cx="23.5" cy="23.5" r="1.3" fill="#66cc8a" />
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-[17px] font-bold tracking-tight text-ink">
        post train
      </span>
    </span>
  );
}
