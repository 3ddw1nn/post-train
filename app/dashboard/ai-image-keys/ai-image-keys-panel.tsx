"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ActionButton, FormDialog } from "@/components/interactive";

type KeyRow = { id: string; provider: string; last4: string; created_at: string };
type Provider = { id: string; label: string; consoleUrl: string };

export function AiImageKeysPanel({
  hasAccess,
  keys,
  providers,
}: {
  hasAccess: boolean;
  keys: KeyRow[];
  providers: Provider[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveKey(providerId: string, apiKey: string) {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/app/image-gen-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, apiKey }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error?.message ?? "Could not save key.");
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">AI Image Keys</h1>
        <p className="mt-1 text-sm text-muted">
          Use your own API keys for Slideshow Studio&apos;s AI image models instead of the shared
          default.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Icon name="lock" size={13} className="text-primary-deep" />
          Encrypted at rest (AES-256) — only used server-side to generate images, never shown
          again after saving.
        </p>
      </div>

      {!hasAccess && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-warning-bg p-4">
          <div>
            <p className="font-bold text-warning-ink">Content Studio Required</p>
            <p className="text-sm text-warning-ink/90">
              AI image generation is part of Content Studio, which requires an active paid plan.
            </p>
          </div>
          <Link href="/dashboard/settings/billing" className="btn-warning">
            Manage Billing
          </Link>
        </div>
      )}

      <section className="card mt-4 divide-y divide-line overflow-hidden">
        {providers.map((provider) => {
          const key = keys.find((k) => k.provider === provider.id);
          return (
            <div key={provider.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{provider.label}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {key ? (
                    <>
                      <code className="rounded bg-page px-1 font-mono">••••{key.last4}</code>
                      {" · added "}
                      {new Date(key.created_at).toLocaleDateString()}
                    </>
                  ) : (
                    <>
                      Not configured — using the shared default, if any.{" "}
                      <a href={provider.consoleUrl} target="_blank" rel="noreferrer" className="underline">
                        Get a key <Icon name="external" size={11} className="inline" />
                      </a>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                className="btn-subtle !py-1.5 text-xs"
                disabled={!hasAccess}
                onClick={() => setEditing(provider)}
              >
                {key ? "Update key" : "Set key"}
              </button>
              {key && (
                <ActionButton
                  endpoint="/api/app/image-gen-keys"
                  method="DELETE"
                  body={{ id: key.id }}
                  confirmText={`Remove your ${provider.label} key? Studio will fall back to the shared default, if any.`}
                  className="btn-subtle !py-1.5 text-xs !text-danger"
                >
                  Remove
                </ActionButton>
              )}
            </div>
          );
        })}
      </section>

      {editing && (
        <FormDialog
          title={`${editing.label} key`}
          message="Paste the API key from that provider's console. It's encrypted before it's stored."
          fields={[{ name: "apiKey", label: "API key", type: "password", placeholder: "sk-...", required: true }]}
          confirmLabel="Save key"
          busy={saving}
          error={saveError}
          onCancel={() => {
            setEditing(null);
            setSaveError(null);
          }}
          onSubmit={(values) => saveKey(editing.id, values.apiKey)}
        />
      )}
    </>
  );
}
