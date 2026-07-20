"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { CopyField, ActionButton } from "@/components/interactive";

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  last4: string;
  last_used_at: string | null;
  created_at: string;
};

export function ApiKeysPanel({ hasAccess, keys }: { hasAccess: boolean; keys: KeyRow[] }) {
  const router = useRouter();
  const [freshKey, setFreshKey] = useState<string | null>(null);

  async function createKey() {
    const name = window.prompt("Name this key (e.g. “agent-bot”)", "My API key");
    if (name === null) return;
    const res = await fetch("/api/app/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error?.message ?? "Could not create key.");
      return;
    }
    setFreshKey(data.key);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="mt-1 text-sm text-muted">
            Post programmatically — same engine, no dashboard required.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={!hasAccess}
          onClick={createKey}
          title={hasAccess ? undefined : "Enable the API add-on first"}
        >
          <Icon name="plus" size={15} /> Create API Key
        </button>
      </div>

      {!hasAccess && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-warning-bg p-4">
          <div>
            <p className="font-bold text-warning-ink">API Access Required</p>
            <p className="text-sm text-warning-ink/90">
              The REST API is a paid add-on ($5/mo or $50/yr) on top of an active
              subscription. Enable it from Billing to create keys.
            </p>
          </div>
          <Link href="/dashboard/settings/billing" className="btn-warning">
            Manage Billing
          </Link>
        </div>
      )}

      {freshKey && (
        <div className="card mt-4 border-primary bg-primary-soft p-4">
          <p className="text-sm font-bold text-primary-dark">
            Here&apos;s your new key — copy it now, it won&apos;t be shown again.
          </p>
          <div className="mt-2">
            <CopyField value={freshKey} />
          </div>
        </div>
      )}

      <section className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-page/50 px-4 py-2.5">
          <h2 className="text-sm font-bold">Active keys</h2>
          <span className="text-xs font-semibold text-muted">
            {keys.length} key{keys.length === 1 ? "" : "s"}
          </span>
        </div>
        {keys.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-page text-muted">
              <Icon name="key" size={22} />
            </span>
            <p className="font-bold">No API keys yet</p>
            <p className="text-sm text-muted">
              Create your first API key to start posting programmatically.
            </p>
            <button className="btn-primary" disabled={!hasAccess} onClick={createKey}>
              <Icon name="plus" size={15} /> Create your first API Key
            </button>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{k.name}</p>
                  <p className="text-xs text-muted">
                    created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at
                      ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`
                      : " · never used"}
                  </p>
                </div>
                <code className="rounded-md bg-page px-2 py-1 font-mono text-xs text-muted">
                  {k.key_prefix}…{k.last4}
                </code>
                <ActionButton
                  endpoint="/api/app/api-keys"
                  method="DELETE"
                  body={{ id: k.id }}
                  confirmText={`Revoke “${k.name}”? Requests with it will fail immediately.`}
                  className="btn-subtle !py-1.5 text-xs !text-danger"
                >
                  Revoke
                </ActionButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function WebhookForm({ initial }: { initial: string }) {
  const [url, setUrl] = useState(initial);
  const [saved, setSaved] = useState(false);
  const valid = url === "" || /^https?:\/\/.+\..+/.test(url);
  return (
    <div className="flex items-center gap-2">
      <input
        className="input"
        placeholder="https://your-server.com/webhook"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setSaved(false);
        }}
        aria-label="Webhook URL"
      />
      <button
        className="btn-primary shrink-0"
        disabled={!valid || (url === initial && !saved)}
        onClick={async () => {
          await fetch("/api/app/workspace", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ webhook_url: url }),
          });
          setSaved(true);
        }}
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
