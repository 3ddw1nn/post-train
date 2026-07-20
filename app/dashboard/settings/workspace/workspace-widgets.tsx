"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ActionButton, Dropdown, FormDialog, Select } from "@/components/interactive";
import type { WorkspaceRole } from "@/lib/permissions";

export function RefreshButton() {
  const router = useRouter();
  return (
    <button className="btn-subtle" onClick={() => router.refresh()}>
      <Icon name="refresh" size={14} /> Refresh
    </button>
  );
}

export function InviteForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="email"
          className="input"
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Invite email"
        />
        <button
          className="btn-primary shrink-0"
          disabled={!email.includes("@")}
          onClick={async () => {
            setError(null);
            const res = await fetch("/api/app/teams/invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ team_id: teamId, email }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
              setError(data?.error?.message ?? "Invite failed.");
              return;
            }
            setLink(data.invite_link);
            setEmail("");
            router.refresh();
          }}
        >
          Invite
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
      {link && (
        <p className="mt-1.5 break-all text-xs text-muted">
          Invite created — in this local build share the link directly:{" "}
          <span className="font-mono">{link}</span>
        </p>
      )}
    </div>
  );
}

export function MemberRow({
  teamMemberId,
  userId,
  name,
  email,
  status,
  role,
  isSelf,
  actorRole,
  actorCanManage,
}: {
  teamMemberId: number;
  userId: string | null;
  name: string;
  email: string;
  status: string;
  role: WorkspaceRole | null;
  isSelf: boolean;
  actorRole: WorkspaceRole | null;
  actorCanManage: boolean;
}) {
  const router = useRouter();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = status === "invited";
  const canRemove =
    !isSelf &&
    role !== "owner" &&
    (actorRole === "owner" || (actorRole === "admin" && (role === "member" || role === null)));
  const canChangeRole = actorCanManage && !isSelf && !!userId && role !== "owner" && !pending;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/app/workspace/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, team_member_id: teamMemberId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Could not remove.");
        return;
      }
      setConfirmRemove(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-dark">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {name}
            {isSelf && <span className="ml-1 font-medium text-muted">(you)</span>}
          </p>
          <p className="truncate text-xs text-muted">{pending ? "Invite pending" : email}</p>
        </div>
      </div>

      <div className="w-36 shrink-0">
        {role === "owner" ? (
          <span className="pill inline-flex items-center gap-1 bg-amber-50 text-amber-700">
            <Icon name="crown" size={13} /> Owner
          </span>
        ) : canChangeRole ? (
          <Select
            value={role ?? "member"}
            onChange={async (value) => {
              await fetch("/api/app/workspace/members", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, role: value }),
              });
              router.refresh();
            }}
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
            ]}
            width={140}
          />
        ) : (
          <span className="pill bg-gray-100 capitalize text-gray-600">{pending ? "Invited" : role}</span>
        )}
      </div>

      {canRemove && (
        <>
          <Dropdown
            align="right"
            width={160}
            trigger={
              <button type="button" aria-label="Member options" className="btn-subtle !px-2 !py-1.5">
                <Icon name="dots" size={16} strokeWidth={2.5} />
              </button>
            }
          >
            <div className="py-1">
              <button
                type="button"
                className="flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-page"
                onClick={() => setConfirmRemove(true)}
              >
                {pending ? "Cancel invite" : "Remove"}
              </button>
            </div>
          </Dropdown>
          {confirmRemove && (
            <FormDialog
              title={pending ? "Cancel invite" : "Remove member"}
              message={
                pending
                  ? "Cancel this invite?"
                  : "Remove this person from the workspace? They'll lose access immediately."
              }
              fields={[]}
              confirmLabel={pending ? "Cancel invite" : "Remove"}
              busy={busy}
              error={error}
              onCancel={() => {
                setConfirmRemove(false);
                setError(null);
              }}
              onSubmit={remove}
            />
          )}
        </>
      )}
    </div>
  );
}

export function LeaveButton() {
  return (
    <ActionButton
      endpoint="/api/app/workspace/leave"
      method="POST"
      className="btn-subtle text-danger"
      confirmText="Leave this workspace? You'll lose access immediately."
      confirmLabel="Leave workspace"
      redirectTo="/dashboard"
    >
      <Icon name="x" size={14} /> Leave workspace
    </ActionButton>
  );
}

export function TransferOwnership({ admins }: { admins: { userId: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(admins[0]?.userId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transfer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/app/workspace/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: target }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Transfer failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-3 p-5">
      <div className="flex items-center gap-2">
        <Icon name="shield" size={16} className="text-muted" />
        <p className="text-sm font-bold">Transfer ownership</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        Hand this workspace to a current admin. You&apos;ll become an admin yourself.
      </p>
      {admins.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Promote someone to admin first — ownership can only transfer to an admin.</p>
      ) : open ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={target}
            onChange={setTarget}
            options={admins.map((a) => ({ value: a.userId, label: a.name }))}
            width={220}
          />
          <button className="btn-primary" disabled={busy} onClick={transfer}>
            Confirm transfer
          </button>
          <button className="btn-subtle" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </button>
          {error && <p className="w-full text-xs font-medium text-danger">{error}</p>}
        </div>
      ) : (
        <button className="btn-subtle mt-3" onClick={() => setOpen(true)}>
          Transfer ownership
        </button>
      )}
    </div>
  );
}

export function DeleteWorkspace({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete(values: Record<string, string>) {
    if (values.confirm_name !== workspaceName) {
      setError(`Type "${workspaceName}" exactly to confirm.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_name: values.confirm_name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not delete workspace.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-3 border-red-200 bg-red-50/40 p-5">
      <div className="flex items-center gap-2">
        <Icon name="trash" size={16} className="text-danger" />
        <p className="text-sm font-bold text-danger">Danger zone</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        Deleting this workspace removes every member and permanently erases all posts, connections,
        and data in it. This can&apos;t be undone.
      </p>
      <button className="btn-subtle mt-3 text-danger" onClick={() => setOpen(true)}>
        Delete workspace
      </button>
      {open && (
        <FormDialog
          title="Delete workspace"
          message={`This removes all members and permanently deletes everything in "${workspaceName}". Type the workspace name to confirm.`}
          fields={[{ name: "confirm_name", label: "Workspace name", placeholder: workspaceName, required: true }]}
          confirmLabel="Delete workspace"
          busy={busy}
          error={error}
          onCancel={() => {
            setOpen(false);
            setError(null);
          }}
          onSubmit={confirmDelete}
        />
      )}
    </div>
  );
}
