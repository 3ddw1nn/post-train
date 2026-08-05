"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export type ConnectedApp = {
  client_id: string;
  client_name: string;
  scope: string;
  created_at: string;
};

/**
 * OAuth clients (Claude and friends) this user has approved. Disconnecting
 * revokes every refresh token the client holds, so it can't mint new access
 * tokens — its current one still works until it expires, at most an hour.
 */
export function ConnectedApps({ apps }: { apps: ConnectedApp[] }) {
  const router = useRouter();

  async function disconnect(clientId: string, name: string) {
    if (!confirm(`Disconnect ${name}? It will lose access to this workspace within the hour.`)) return;
    await fetch("/api/app/oauth-grants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
    });
    router.refresh();
  }

  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-page/50 px-4 py-2.5">
        <h2 className="text-sm font-bold">Connected apps</h2>
        <span className="text-xs font-semibold text-muted">
          {apps.length} app{apps.length === 1 ? "" : "s"}
        </span>
      </div>

      {apps.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          Nothing connected yet. Add Post Train as a custom connector in Claude using the MCP URL
          above, and it&apos;ll appear here once you approve it.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {apps.map((app) => (
            <li key={app.client_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{app.client_name}</p>
                <p className="text-xs text-muted">
                  {app.scope
                    .split(" ")
                    .map((s) => (s === "read" ? "Read" : "Publish"))
                    .join(" · ")}{" "}
                  · connected {new Date(app.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => disconnect(app.client_id, app.client_name)}
                className="btn !py-1.5 text-xs font-semibold text-danger hover:bg-page"
              >
                <Icon name="x" size={13} strokeWidth={2.5} /> Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
