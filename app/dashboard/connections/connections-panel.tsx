"use client";

import { useState } from "react";
import { PLATFORMS, platform as platformOf } from "@/lib/platforms";
import { PlatformIcon, AccountAvatar } from "@/components/platform-icon";
import { Icon } from "@/components/icons";
import { ActionButton } from "@/components/interactive";

type Account = { id: number; platform: string; username: string; status: string };

export function ConnectionsPanel({
  accounts,
  used,
  cap,
  error,
}: {
  accounts: Account[];
  used: number;
  cap: number | null;
  error: string | null;
}) {
  const [showIds, setShowIds] = useState(false);
  const [filter, setFilter] = useState("");
  const stale = accounts.filter((a) => a.status === "needs_reauth");
  const platforms = PLATFORMS.filter((p) => !filter || p.id === filter);

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Connections</h1>
      {error === "oauth_cancelled" && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          Connection cancelled — no account was linked.
        </p>
      )}
      <div className="card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Connected Accounts</h2>
            <p className="text-xs text-muted">
              {used} connected{cap !== null ? ` of ${cap} allowed on your plan` : " · unlimited on Pro"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted">
              Show IDs
              <button
                type="button"
                role="switch"
                aria-checked={showIds}
                className="pt-toggle scale-90"
                data-on={showIds}
                onClick={() => setShowIds((v) => !v)}
              >
                <span />
              </button>
            </label>
            <div className="flex items-center gap-1 text-muted">
              <Icon name="filter" size={14} />
              <select
                className="input w-auto !py-1 text-xs font-semibold"
                value={filter}
                aria-label="Filter platforms"
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">all accounts</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col divide-y divide-line">
          {platforms.map((p) => {
            const rows = accounts.filter((a) => a.platform === p.id);
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <PlatformIcon id={p.id} size={22} />
                <a
                  href={`/oauth/mock/${p.id}?return=${encodeURIComponent("/dashboard/connections")}`}
                  className="btn-dark !py-1.5 text-xs"
                >
                  Connect {p.name}
                </a>
                <div className="flex flex-wrap items-center gap-2">
                  {rows.map((a) => (
                    <span
                      key={a.id}
                      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-1.5 text-xs font-semibold ${
                        a.status === "needs_reauth"
                          ? "border-amber-300 bg-amber-50"
                          : "border-line bg-white"
                      }`}
                    >
                      <AccountAvatar username={a.username} platformId={a.platform} size={22} />
                      @{a.username}
                      {showIds && (
                        <code className="rounded bg-page px-1 text-[10px] text-muted">
                          #{a.id}
                        </code>
                      )}
                      <ActionButton
                        endpoint={`/api/connections/${a.id}`}
                        method="DELETE"
                        confirmText={`Remove @${a.username}? Scheduled posts to this account will fail at publish time.`}
                        className="text-muted hover:text-danger"
                        title="Remove account"
                      >
                        <Icon name="x" size={12} strokeWidth={3} />
                      </ActionButton>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {stale.length > 0 && (
          <div className="mt-2 border-t border-line pt-4">
            <p className="text-xs font-bold text-warning-ink">
              These accounts need re-authentication:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {stale.map((a) => (
                <a
                  key={a.id}
                  href={`/oauth/mock/${a.platform}?reconnect=${a.id}&return=${encodeURIComponent("/dashboard/connections")}`}
                  className="btn-warning !py-1.5 text-xs"
                >
                  <Icon name="refresh" size={13} /> Refresh {platformOf(a.platform)?.name} (@
                  {a.username})
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="mt-5 text-xs text-muted">
          Trouble linking something?{" "}
          <a
            href="mailto:support@posttrain.example"
            className="font-semibold text-primary-deep hover:underline"
          >
            Get help connecting your accounts
          </a>
        </p>
      </div>
    </div>
  );
}
