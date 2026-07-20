"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, CopyField, FormDialog } from "@/components/interactive";

export function DisplayNameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  const dirty = name.trim() !== initial && name.trim().length > 0;
  return (
    <div className="flex items-center gap-2">
      <input
        className="input"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        aria-label="Display name"
      />
      <button
        className="btn-primary shrink-0"
        disabled={!dirty}
        onClick={async () => {
          await fetch("/api/app/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: name }),
          });
          setSaved(true);
          router.refresh();
        }}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}

export function ChangeEmailButton({ current }: { current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function changeEmail(email: string) {
    setError(null);
    if (!email || email === current) {
      setOpen(false);
      return;
    }
    const res = await fetch("/api/auth/change-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message ?? "Could not change email.");
      return;
    }
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <button className="btn-subtle" onClick={() => setOpen(true)}>
        Change Email Address
      </button>
      {open && (
        <FormDialog
          title="Change email"
          fields={[
            {
              name: "email",
              label: "New email address",
              type: "email",
              defaultValue: current,
              required: true,
            },
          ]}
          confirmLabel="Change email"
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={(values) => changeEmail(values.email)}
        />
      )}
    </>
  );
}

export function ChangePasswordControls() {
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  async function changePassword(values: Record<string, string>) {
    const next = values.next;
    if (!next) return;
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: values.current ?? "", next }),
    });
    const data = await res.json().catch(() => null);
    setMsg(res.ok ? "Password updated." : (data?.error?.message ?? "Failed."));
    if (res.ok) setOpen(false);
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn-subtle" onClick={() => setOpen(true)}>
          Change Password
        </button>
        <button
          className="btn-subtle"
          onClick={async () => {
            await fetch("/api/auth/reset-request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: "self" }),
            });
            setMsg("Reset link created — check the server console in this local build.");
          }}
        >
          Forgot Password? Send Reset Link
        </button>
      </div>
      {msg && <p className="text-xs font-medium text-muted">{msg}</p>}
      {open && (
        <FormDialog
          title="Change password"
          message="Leave the current password blank if this account was created with Google."
          fields={[
            { name: "current", label: "Current password", type: "password" },
            { name: "next", label: "New password", type: "password", required: true },
          ]}
          confirmLabel="Change password"
          error={msg && msg !== "Password updated." ? msg : null}
          onCancel={() => setOpen(false)}
          onSubmit={changePassword}
        />
      )}
    </div>
  );
}

export function SignOutAllButton() {
  return (
    <ActionButton
      endpoint="/api/auth/signout-all"
      method="POST"
      className="btn-subtle"
      confirmTitle="Sign out everywhere?"
      confirmText="All sessions will be revoked."
      confirmLabel="Sign out"
      confirmTone="default"
      redirectTo="/signin"
    >
      Sign Out All Devices
    </ActionButton>
  );
}

export function WeeklyGoalForm({ initial }: { initial: number }) {
  const [goal, setGoal] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        className="input w-24"
        value={goal}
        onChange={(e) => {
          setGoal(Number(e.target.value));
          setSaved(false);
        }}
        aria-label="Weekly posting goal"
      />
      <span className="text-sm text-muted">posts per week</span>
      <button
        className="btn-primary ml-auto"
        disabled={goal === initial && !saved}
        onClick={async () => {
          await fetch("/api/app/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weekly_posting_goal: goal }),
          });
          setSaved(true);
        }}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}

export function McpUrlField() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return <CopyField value={`${origin || "http://localhost:3000"}/api/mcp/mcp`} />;
}
