"use client";

import { useState } from "react";
import { PLATFORMS, platform as platformOf, connectHref, CONNECT_ERRORS, type PlatformId } from "@/lib/platforms";
import { PlatformIcon, AccountAvatar } from "@/components/platform-icon";
import { Icon } from "@/components/icons";
import { ActionButton } from "@/components/interactive";

type Account = { id: number; platform: string; username: string; status: string; avatar_url: string | null };

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="mt-1 text-sm text-muted">
            Every account your posts can depart to.
          </p>
        </div>
        {cap !== null ? (
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {used} <span className="font-medium text-muted">of {cap} accounts</span>
            </p>
            <div className="mt-1.5 h-1 w-36 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, cap ? (used / cap) * 100 : 0)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold tabular-nums">
            {used} <span className="font-medium text-muted">accounts · unlimited on Pro</span>
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {CONNECT_ERRORS[error] ?? "Something went wrong connecting that account — try again."}
        </p>
      )}

      {stale.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-warning-bg px-4 py-3">
          <p className="text-sm font-bold text-warning-ink">
            {stale.length} account{stale.length === 1 ? "" : "s"} need
            {stale.length === 1 ? "s" : ""} re-authentication:
          </p>
          {stale.map((a) => (
            <a
              key={a.id}
              href={connectHref(a.platform as PlatformId, { returnTo: "/dashboard/connections", reconnect: a.id })}
              className="btn-warning !py-1.5 text-xs"
            >
              <Icon name="refresh" size={13} /> Refresh {platformOf(a.platform)?.name} (@
              {a.username})
            </a>
          ))}
        </div>
      )}

      <div className="card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page/50 px-4 py-2.5">
          <div className="flex items-center gap-1 text-muted">
            <Icon name="filter" size={14} />
            <select
              className="input w-auto !border-0 !bg-transparent !py-1 text-xs font-semibold"
              value={filter}
              aria-label="Filter platforms"
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
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
        </div>

        <div className="flex flex-col divide-y divide-line">
          {platforms.map((p) => {
            const rows = accounts.filter((a) => a.platform === p.id);
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex w-32 shrink-0 items-center gap-2.5">
                  <PlatformIcon id={p.id} size={20} />
                  <span className="text-sm font-semibold">{p.name}</span>
                </div>
                <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
                  {rows.length === 0 && (
                    <span className="text-xs text-muted">Not connected</span>
                  )}
                  {rows.map((a) => (
                    <span
                      key={a.id}
                      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-1.5 text-xs font-semibold ${
                        a.status === "needs_reauth"
                          ? "border-amber-300 bg-amber-50"
                          : "border-line bg-white"
                      }`}
                    >
                      <AccountAvatar
                        username={a.username}
                        platformId={a.platform}
                        avatarUrl={a.avatar_url}
                        size={22}
                      />
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
                <a
                  href={connectHref(p.id, { returnTo: "/dashboard/connections" })}
                  aria-label={`Connect ${p.name}`}
                  className="btn-subtle order-2 ml-auto shrink-0 !py-1.5 text-xs sm:order-none"
                >
                  <Icon name="plus" size={13} strokeWidth={2.5} /> Connect
                </a>
              </div>
            );
          })}
        </div>

        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Trouble linking something?{" "}
          <a
            href="mailto:ehleedev@gmail.com"
            className="font-semibold text-primary-deep hover:underline"
          >
            Get help connecting your accounts
          </a>
        </p>
      </div>
    </div>
  );
}
