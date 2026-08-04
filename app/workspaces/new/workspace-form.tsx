"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export function NewWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a name for your workspace.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error?.message ?? "We couldn't create that workspace. Try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={createWorkspace} className="mt-10 max-w-md">
      <label htmlFor="workspace-name" className="text-sm font-semibold text-ink">
        Workspace name
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="workspace-name"
          className="input h-11"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Acme Marketing"
          maxLength={60}
          autoFocus
          disabled={isSubmitting}
          aria-describedby={error ? "workspace-name-error" : undefined}
        />
        <button type="submit" className="btn-primary h-11 shrink-0" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : <><Icon name="plus" size={16} /> Create workspace</>}
        </button>
      </div>
      {error ? (
        <p id="workspace-name-error" role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">You can invite teammates and connect channels once you&apos;re in.</p>
      )}
    </form>
  );
}
