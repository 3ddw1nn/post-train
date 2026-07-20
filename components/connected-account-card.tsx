import { AccountAvatar } from "./platform-icon";
import { platform, connectHref, type PlatformId } from "@/lib/platforms";
import type { SocialAccountRow } from "@/lib/posts";
import { ActionButton, Dropdown } from "./interactive";
import { Icon } from "./icons";

export function ConnectedAccountCard({
  account,
  returnTo,
}: {
  account: SocialAccountRow;
  returnTo: string;
}) {
  const p = platform(account.platform);
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <AccountAvatar
        username={account.username}
        platformId={account.platform}
        avatarUrl={account.avatar_url}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{p?.name}</p>
        <p className="truncate text-sm text-muted">@{account.username}</p>
      </div>
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          account.status === "active" ? "bg-primary" : "bg-amber-400"
        }`}
        title={account.status === "active" ? "Connected" : "Needs re-authentication"}
      />
      <Dropdown
        align="right"
        width={200}
        trigger={
          <button type="button" aria-label="Account actions" className="btn-subtle !px-2 !py-1.5">
            <Icon name="dots" size={16} strokeWidth={2.5} />
          </button>
        }
      >
        <a
          href={connectHref(account.platform as PlatformId, { returnTo, reconnect: account.id })}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-page"
        >
          <Icon name="refresh" size={14} /> Reconnect
        </a>
        <ActionButton
          endpoint={`/api/connections/${account.id}`}
          method="DELETE"
          confirmText={`Remove @${account.username}? Scheduled posts to this account will fail at publish time.`}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-danger hover:bg-red-50"
        >
          <Icon name="trash" size={14} /> Remove
        </ActionButton>
      </Dropdown>
    </div>
  );
}
