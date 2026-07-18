import { platform } from "@/lib/platforms";

export function PlatformIcon({
  id,
  size = 18,
  colored = true,
  className,
}: {
  id: string;
  size?: number;
  colored?: boolean;
  className?: string;
}) {
  const p = platform(id);
  if (!p) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={p.name}
    >
      <path d={p.path} fill={colored ? p.hex : "currentColor"} />
    </svg>
  );
}

export function PlatformIconRow({
  ids,
  size = 15,
  colored = true,
}: {
  ids: string[];
  size?: number;
  colored?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {ids.map((id) => (
        <PlatformIcon key={id} id={id} size={size} colored={colored} />
      ))}
    </span>
  );
}

/** Account avatar with a platform badge in the corner. */
export function AccountAvatar({
  username,
  platformId,
  avatarUrl,
  size = 40,
  selected,
}: {
  username: string;
  platformId: string;
  avatarUrl?: string | null;
  size?: number;
  selected?: boolean;
}) {
  const initial = (username || "?").replace(/^@/, "").charAt(0).toUpperCase();
  const hue =
    [...username].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className={`relative inline-flex shrink-0 rounded-full ${
        selected === undefined
          ? ""
          : selected
            ? "ring-2 ring-primary ring-offset-2"
            : "opacity-60 grayscale-[0.4]"
      }`}
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, per-user URLs from 4+ platforms; not worth Next/Image's domain allowlist churn
        <img
          src={avatarUrl}
          alt={username}
          className="h-full w-full rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full text-white font-bold"
          style={{
            background: `hsl(${hue} 45% 55%)`,
            fontSize: size * 0.42,
          }}
        >
          {initial}
        </span>
      )}
      <span
        className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-white shadow ring-1 ring-line"
        style={{ width: size * 0.48, height: size * 0.48 }}
      >
        <PlatformIcon id={platformId} size={size * 0.3} />
      </span>
    </span>
  );
}
