"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ActionButton } from "@/components/interactive";

export function MemberActions({
  userId,
  teamMemberId,
  role,
}: {
  userId: string;
  teamMemberId: number;
  role: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <ActionButton
        endpoint="/api/app/teams/members"
        method="PATCH"
        body={{ user_id: userId, role: role === "admin" ? "member" : "admin" }}
        className="btn-subtle !px-2 !py-1 text-xs"
      >
        {role === "admin" ? "Make member" : "Make admin"}
      </ActionButton>
      <ActionButton
        endpoint="/api/app/teams/members"
        method="DELETE"
        body={{ user_id: userId, team_member_id: teamMemberId }}
        className="btn-subtle !px-2 !py-1 text-xs text-danger"
        confirmText="Remove this person from the workspace? They'll lose access immediately."
      >
        Remove
      </ActionButton>
    </div>
  );
}

export function RefreshButton() {
  const router = useRouter();
  return (
    <button className="btn-subtle" onClick={() => router.refresh()}>
      <Icon name="refresh" size={14} /> Refresh
    </button>
  );
}

export function CreateTeamButton() {
  const router = useRouter();
  return (
    <button
      className="btn-primary"
      onClick={async () => {
        const name = window.prompt("Team name");
        if (!name?.trim()) return;
        const res = await fetch("/api/app/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          alert(data?.error?.message ?? "Could not create team.");
          return;
        }
        router.refresh();
      }}
    >
      <Icon name="plus" size={14} /> Create team
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
