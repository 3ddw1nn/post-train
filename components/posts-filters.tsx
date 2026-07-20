"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "./icons";
import { Dropdown } from "./interactive";

type Option = { value: string; label: string };

export function PostsFilters({
  typeOptions,
  platformOptions,
}: {
  typeOptions: Option[];
  platformOptions: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function hrefFor(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all" || (key === "sort" && value === "recent")) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    return `/dashboard/posts${params.toString() ? `?${params}` : ""}`;
  }

  function setParam(key: string, value: string) {
    router.push(hrefFor(key, value));
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(6,63,59,0.04)]">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_170px_220px] lg:items-end">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Search</span>
          <span className="relative block">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="h-11 w-full rounded-[8px] border border-line bg-white py-2 pl-11 pr-3 text-sm font-semibold text-ink outline-none transition-colors placeholder:text-muted/75 focus:border-primary focus:ring-2 focus:ring-primary/15"
              defaultValue={searchParams.get("q") ?? ""}
              placeholder="Search captions, accounts, or post content"
              onKeyDown={(e) => {
                if (e.key === "Enter") setParam("q", e.currentTarget.value.trim());
              }}
              onBlur={(e) => setParam("q", e.currentTarget.value.trim())}
            />
          </span>
        </label>
        <FilterDropdown
            label="Sort"
            value={searchParams.get("sort") ?? "recent"}
            options={[
              { value: "recent", label: "Most recent" },
              { value: "oldest", label: "Oldest first" },
            ]}
            hrefFor={(value) => hrefFor("sort", value)}
          />
        <FilterDropdown
            label="Type"
            value={searchParams.get("type") ?? "all"}
            options={typeOptions}
            hrefFor={(value) => hrefFor("type", value)}
          />
        <FilterDropdown
            label="Platform"
            value={searchParams.get("platform") ?? "all"}
            options={platformOptions}
            hrefFor={(value) => hrefFor("platform", value)}
          />
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  value,
  options,
  hrefFor,
}: {
  label: string;
  value: string;
  options: Option[];
  hrefFor: (value: string) => string;
}) {
  // Optimistic: the trigger label and checkmark flip instantly on click,
  // ahead of the real navigation settling.
  const [optimisticValue, setOptimisticValue] = useState(value);
  useEffect(() => setOptimisticValue(value), [value]);
  const selected = options.find((option) => option.value === optimisticValue) ?? options[0];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <Dropdown
        align="right"
        width={220}
        trigger={
          <button
            type="button"
            className="flex h-11 w-full items-center justify-between gap-2 rounded-[8px] border border-line bg-white px-3 text-left text-sm font-bold text-ink shadow-[0_1px_1px_rgba(6,63,59,0.03)] transition-colors hover:bg-page"
          >
            <span className="truncate">{selected.label}</span>
            <Icon name="chevronDown" size={15} className="shrink-0 text-muted" />
          </button>
        }
      >
        <div className="max-h-72 overflow-y-auto py-1">
          {options.map((option) => {
            const active = option.value === optimisticValue;
            return (
              <Link
                key={option.value}
                href={hrefFor(option.value)}
                onClick={() => setOptimisticValue(option.value)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors hover:bg-page ${
                  active ? "text-primary-deep" : "text-ink"
                }`}
              >
                <Icon
                  name="check"
                  size={14}
                  className={active ? "text-primary-deep" : "opacity-0"}
                />
                <span className="truncate">{option.label}</span>
              </Link>
            );
          })}
        </div>
      </Dropdown>
    </div>
  );
}
