import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { apiAccess } from "@/lib/entitlements";
import { convexQuery } from "@/lib/db";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/icons";
import { ApiKeysPanel, WebhookForm } from "./api-keys-panel";

export const metadata = { title: "API Keys" };

export default async function ApiKeysPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  const sub = await getSubscription(user.id);
  const hasAccess = apiAccess(sub);
  const keys = (await convexQuery<{
    id: string;
    name: string;
    key_prefix: string;
    last4: string;
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
  }[]>(api.apiKeys.listForWorkspace, { workspace_id: ws.id }))
    .filter((key) => !key.revoked_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <ApiKeysPanel hasAccess={hasAccess} keys={keys} />

      <section className="card mt-4 divide-y divide-line">
        <div className="p-5">
          <h2 className="text-sm font-bold">Webhook</h2>
          <p className="mt-1 text-sm text-muted">
            Get notified when a post finishes. We&apos;ll POST the per-platform results to
            your URL, signed with HMAC-SHA256 in the <code className="rounded bg-page px-1">X-Signature</code>{" "}
            header.
          </p>
          <div className="mt-3">
            <WebhookForm initial={ws.webhook_url ?? ""} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Signing secret for this workspace:{" "}
            <code className="rounded bg-page px-1 font-mono">{ws.webhook_secret}</code>
          </p>
        </div>

        <div className="p-5">
          <Link href="/docs/api" className="flex items-center gap-1.5 text-sm font-bold hover:underline">
            API Documentation <Icon name="external" size={14} />
          </Link>
          <p className="mt-1 text-sm text-muted">
            Authenticate with <code className="rounded bg-page px-1">Authorization: Bearer pt_live_…</code>{" "}
            against <code className="rounded bg-page px-1">/api/v1</code>.
          </p>
          <p className="mt-1 text-xs text-muted">
            Keep keys secret — anyone holding one can post to your connected accounts.
          </p>
        </div>
      </section>
    </div>
  );
}
