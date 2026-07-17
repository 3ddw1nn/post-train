import { requireOnboardedUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Toggle } from "@/components/interactive";
import { UserAvatar } from "@/components/avatar-menu";
import { Icon } from "@/components/icons";
import {
  ChangeEmailButton,
  ChangePasswordControls,
  DisplayNameForm,
  McpUrlField,
  SignOutAllButton,
  WeeklyGoalForm,
} from "./settings-widgets";

export const metadata = { title: "Settings" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ToggleRow({
  title,
  desc,
  field,
  on,
}: {
  title: string;
  desc: string;
  field: string;
  on: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted">{desc}</p>
      </div>
      <Toggle on={on} endpoint="/api/app/settings" field={field} label={title} />
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireOnboardedUser();
  const apps = getDb()
    .prepare("SELECT app_name, created_at FROM connected_apps WHERE user_id = ?")
    .all(user.id) as { app_name: string; created_at: string }[];

  return (
    <div className="flex flex-col gap-4">
      <Card title="Profile">
        <div className="flex items-start gap-4">
          <UserAvatar name={user.display_name || user.email} size={44} />
          <div className="flex-1">
            <DisplayNameForm initial={user.display_name} />
            <p className="mt-1.5 text-xs text-muted">
              Shown in your workspace and on team invites.
            </p>
            <p className="mt-2 text-sm text-muted">
              Signed in as <span className="font-semibold text-ink">{user.email}</span>
            </p>
          </div>
        </div>
      </Card>

      <Card title="Email Address">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{user.email}</p>
          <ChangeEmailButton current={user.email} />
        </div>
      </Card>

      <Card title="Password">
        <ChangePasswordControls />
      </Card>

      <Card title="Security">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Revokes every active session on every device, including this one.
          </p>
          <SignOutAllButton />
        </div>
      </Card>

      <Card title="Email Preferences">
        <div className="divide-y divide-line">
          <ToggleRow
            title="Automation Emails"
            desc="Helpful reminders when you haven't posted or an account disconnects"
            field="email_automation"
            on={!!user.email_automation}
          />
          <ToggleRow
            title="Post Failure Alerts"
            desc="One email per platform when a publish fails"
            field="email_failure_alerts"
            on={!!user.email_failure_alerts}
          />
          <ToggleRow
            title="Post Summary Emails"
            desc="A per-post recap with links to every published destination"
            field="email_post_summary"
            on={!!user.email_post_summary}
          />
        </div>
      </Card>

      <Card title="Platform Preferences">
        <div className="divide-y divide-line">
          <ToggleRow
            title="Use file name as caption"
            desc="Pre-fill the caption from the uploaded file's name"
            field="pref_filename_caption"
            on={!!user.pref_filename_caption}
          />
          <ToggleRow
            title="24-hour time format"
            desc="Show times as 14:30 instead of 2:30 PM"
            field="pref_24h_time"
            on={!!user.pref_24h_time}
          />
          <ToggleRow
            title="Process videos on our servers"
            desc="We re-encode uploads so every platform accepts them (recommended). Turn off to post your file exactly as uploaded — some platforms may reject unusual codecs."
            field="pref_server_video_processing"
            on={!!user.pref_server_video_processing}
          />
        </div>
      </Card>

      <Card title="Weekly Posting Goal">
        <WeeklyGoalForm initial={user.weekly_posting_goal} />
      </Card>

      <Card title="Connect to Claude (MCP)">
        <p className="text-sm text-muted">
          Manage your posts from Claude or any MCP client. Point it at your Post Train MCP
          server and authenticate with an API key.
        </p>
        <div className="mt-3">
          <McpUrlField />
        </div>
        <a href="/mcp" className="btn-primary mt-3">
          Setup Guide
        </a>
      </Card>

      <Card title="Connected Apps">
        {apps.length === 0 ? (
          <p className="text-sm text-muted">No connected apps yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {apps.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Icon name="zap" size={14} className="text-muted" /> {a.app_name}
                <span className="ml-auto text-xs text-muted">
                  since {new Date(a.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
