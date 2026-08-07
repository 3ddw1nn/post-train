"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PLATFORMS } from "@/lib/platforms";
import { Dropdown } from "@/components/interactive";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";

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
          <span className="flex min-w-0 items-center gap-2">
            {selected && <PlatformIcon id={selected.id} size={16} />}
            <span className="truncate">{selected?.name ?? "All Platforms"}</span>
          </span>
          <Icon name="chevronDown" size={15} className="shrink-0 text-muted" />
        </button>
      }
    >
      {/* Tall enough for "All" + 11 platforms so the tail isn't hidden behind
          a scrollbar nobody notices; still scrolls on short screens. */}
      <div className="max-h-[min(27rem,60vh)] overflow-y-auto py-1">
        <PlatformOption href={hrefFor("")} active={!value} label="All Platforms" />
        {PLATFORMS.map((platform) => (
          <PlatformOption
            key={platform.id}
            href={hrefFor(platform.id)}
            active={platform.id === value}
            label={platform.name}
            platformId={platform.id}
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
  platformId,
}: {
  href: string;
  active: boolean;
  label: string;
  platformId?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-page ${
        active ? "text-primary-deep" : "text-ink"
      }`}
    >
      <Icon name="check" size={14} className={`shrink-0 ${active ? "text-primary-deep" : "opacity-0"}`} />
      {platformId && <PlatformIcon id={platformId} size={16} />}
      <span className="truncate">{label}</span>
    </Link>
  );
}
