"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PLATFORMS } from "@/lib/platforms";
import { Dropdown } from "@/components/interactive";
import { Icon } from "@/components/icons";

export function PlatformFilter({
  value,
  previewLocked = false,
}: {
  value: string;
  previewLocked?: boolean;
}) {
  const params = useSearchParams();
  const selected = PLATFORMS.find((platform) => platform.id === value);

  function hrefFor(platformId: string) {
    if (previewLocked) return "/dashboard/settings/plans";
    const next = new URLSearchParams(params.toString());
    if (platformId) next.set("platform", platformId);
    else next.delete("platform");
    return `/dashboard/posts/calendar?${next}`;
  }

  return (
    <Dropdown
      align="right"
      width={230}
      trigger={
        <button
          type="button"
          className="flex h-10 min-w-[190px] items-center justify-between gap-2 rounded-[10px] border border-line bg-white px-3 text-left text-sm font-bold text-ink hover:bg-page"
          aria-label="Filter by platform"
        >
          <span className="truncate">{selected?.name ?? "All Platforms"}</span>
          <Icon name="chevronDown" size={15} className="shrink-0 text-muted" />
        </button>
      }
    >
      <div className="max-h-80 overflow-y-auto py-1">
        <PlatformOption href={hrefFor("")} active={!value} label="All Platforms" />
        {PLATFORMS.map((platform) => (
          <PlatformOption
            key={platform.id}
            href={hrefFor(platform.id)}
            active={platform.id === value}
            label={platform.name}
          />
        ))}
      </div>
    </Dropdown>
  );
}

function PlatformOption({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-page ${
        active ? "text-primary-deep" : "text-ink"
      }`}
    >
      <Icon name="check" size={14} className={active ? "text-primary-deep" : "opacity-0"} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
