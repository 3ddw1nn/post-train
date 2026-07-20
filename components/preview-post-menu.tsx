"use client";

import Link from "next/link";
import { Icon } from "./icons";
import { Dropdown } from "./interactive";

export function PreviewPostMenu({ editable }: { editable: boolean }) {
  return (
    <Dropdown
      align="right"
      width={190}
      trigger={
        <button type="button" aria-label="Preview post actions" className="btn-subtle !px-2 !py-1.5">
          <Icon name="dots" size={16} strokeWidth={2.5} />
        </button>
      }
    >
      <Link
        href="/dashboard/settings/plans"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
      >
        <Icon name={editable ? "pencil" : "eye"} size={14} /> {editable ? "Edit" : "View"}
      </Link>
      <Link
        href="/dashboard/settings/plans"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
      >
        <Icon name="copy" size={14} /> Duplicate
      </Link>
      <Link
        href="/dashboard/settings/plans"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-danger hover:bg-red-50"
      >
        <Icon name="trash" size={14} /> Delete
      </Link>
    </Dropdown>
  );
}
