"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PLATFORMS } from "@/lib/platforms";

export function PlatformFilter({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <select
      className="input w-auto !py-1.5 text-sm font-semibold"
      value={value}
      aria-label="Filter by platform"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("platform", e.target.value);
        else next.delete("platform");
        router.push(`/dashboard/posts/calendar?${next.toString()}`);
      }}
    >
      <option value="">All Platforms</option>
      {PLATFORMS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
