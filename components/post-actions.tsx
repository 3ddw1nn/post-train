"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { ActionButton, Dropdown } from "./interactive";

export type OptimisticPostEvent = {
  caption: string;
  status: string;
};

export function PostActions({
  postId,
  caption,
  editable,
}: {
  postId: string;
  caption: string;
  editable: boolean;
}) {
  const router = useRouter();
  const href = `/dashboard/create/${postId}`;

  function prime() {
    router.prefetch(href);
  }

  async function duplicate() {
    window.dispatchEvent(
      new CustomEvent<OptimisticPostEvent>("pt:optimistic-post", {
        detail: {
          caption: caption || "Duplicating post...",
          status: "Draft",
        },
      })
    );
    const res = await fetch(`/api/app/posts/${postId}/duplicate`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.id) {
      router.refresh();
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("pt:optimistic-post-clear"));
      }, 900);
    } else {
      window.dispatchEvent(new CustomEvent("pt:optimistic-post-clear"));
    }
  }

  return (
    <Dropdown
      align="right"
      width={190}
      trigger={
        <button type="button" aria-label="Post actions" className="btn-subtle !px-2 !py-1.5">
          <Icon name="dots" size={16} strokeWidth={2.5} />
        </button>
      }
    >
      <Link
        href={href}
        prefetch
        onMouseEnter={prime}
        onFocus={prime}
        onPointerDown={prime}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
      >
        <Icon name={editable ? "pencil" : "eye"} size={14} /> {editable ? "Edit" : "View"}
      </Link>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
        onClick={() => void duplicate()}
      >
        <Icon name="copy" size={14} /> Duplicate
      </button>
      {editable && (
        <ActionButton
          endpoint={`/api/app/posts/${postId}`}
          method="DELETE"
          confirmText="Delete this post? This cannot be undone."
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-danger hover:bg-red-50"
        >
          <Icon name="trash" size={14} /> Delete
        </ActionButton>
      )}
    </Dropdown>
  );
}
