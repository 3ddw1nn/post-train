import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  persona TEXT,
  onboarded_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  pref_24h_time INTEGER NOT NULL DEFAULT 0,
  pref_filename_caption INTEGER NOT NULL DEFAULT 0,
  pref_server_video_processing INTEGER NOT NULL DEFAULT 1,
  email_automation INTEGER NOT NULL DEFAULT 1,
  email_failure_alerts INTEGER NOT NULL DEFAULT 0,
  email_post_summary INTEGER NOT NULL DEFAULT 0,
  weekly_posting_goal INTEGER NOT NULL DEFAULT 3,
  free_posts_used INTEGER NOT NULL DEFAULT 0,
  upsell_dismissed INTEGER NOT NULL DEFAULT 0,
  first_subscribed_at TEXT,
  session_epoch INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL DEFAULT 'Main',
  randomize_queue_time INTEGER NOT NULL DEFAULT 0,
  webhook_url TEXT,
  webhook_secret TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT 'month',
  status TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  trial_ends_at TEXT,
  current_period_end TEXT,
  api_addon INTEGER NOT NULL DEFAULT 0,
  api_addon_interval TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  platform_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  connected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_ws ON social_accounts(workspace_id, platform);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'image',
  duration_s REAL,
  width INTEGER,
  height INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_ws ON media(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'text',
  caption TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  is_draft INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  used_queue INTEGER NOT NULL DEFAULT 0,
  queue_timezone TEXT,
  platform_configurations TEXT,
  account_configurations TEXT,
  free_credits_used INTEGER NOT NULL DEFAULT 0,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_sched ON posts(workspace_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS post_media (
  post_id TEXT NOT NULL REFERENCES posts(id),
  media_id TEXT NOT NULL REFERENCES media(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE IF NOT EXISTS post_destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES posts(id),
  social_account_id INTEGER NOT NULL REFERENCES social_accounts(id),
  caption_override TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_dest_post ON post_destinations(post_id);

CREATE TABLE IF NOT EXISTS post_results (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  social_account_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  success INTEGER NOT NULL,
  platform_post_id TEXT,
  share_url TEXT,
  error_code TEXT,
  error_message TEXT,
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_post ON post_results(post_id);

CREATE TABLE IF NOT EXISTS analytics_records (
  id TEXT PRIMARY KEY,
  post_result_id TEXT UNIQUE NOT NULL REFERENCES post_results(id),
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_post_id TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  cover_image_url TEXT,
  share_url TEXT,
  video_description TEXT,
  duration INTEGER,
  platform_created_at TEXT,
  last_synced_at TEXT,
  match_confidence TEXT DEFAULT 'exact'
);

CREATE TABLE IF NOT EXISTS queue_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  time_local TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '1111100',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  last4 TEXT NOT NULL DEFAULT '',
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT,
  email_invited TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connected_apps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  app_name TEXT NOT NULL,
  scopes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

// Singleton across Next.js HMR reloads
const g = globalThis as unknown as { __ptdb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__ptdb) {
    mkdirSync(MEDIA_DIR, { recursive: true });
    const db = new DatabaseSync(path.join(DATA_DIR, "posttrain.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA);
    g.__ptdb = db;
  }
  return g.__ptdb;
}

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
