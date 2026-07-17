"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyField } from "@/components/interactive";

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
  return (
    <button
      className="btn-subtle"
      onClick={async () => {
        const email = window.prompt("New email address", current);
        if (!email || email === current) return;
        const res = await fetch("/api/auth/change-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) alert(data?.error?.message ?? "Could not change email.");
        router.refresh();
      }}
    >
      Change Email Address
    </button>
  );
}

export function ChangePasswordControls() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-subtle"
          onClick={async () => {
            const current = window.prompt("Current password (leave blank if you signed up with Google)") ?? "";
            const next = window.prompt("New password (8+ characters)");
            if (!next) return;
            const res = await fetch("/api/auth/change-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ current, next }),
            });
            const data = await res.json().catch(() => null);
            setMsg(res.ok ? "Password updated." : (data?.error?.message ?? "Failed."));
          }}
        >
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
    </div>
  );
}

export function SignOutAllButton() {
  return (
    <button
      className="btn-subtle"
      onClick={async () => {
        if (!window.confirm("Sign out everywhere? All sessions will be revoked.")) return;
        await fetch("/api/auth/signout-all", { method: "POST" });
        window.location.href = "/signin";
      }}
    >
      Sign Out All Devices
    </button>
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
