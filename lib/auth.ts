import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDb, now, uid, DATA_DIR } from "./db";

export type User = {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  avatar_url: string | null;
  persona: string | null;
  onboarded_at: string | null;
  timezone: string;
  pref_24h_time: number;
  pref_filename_caption: number;
  pref_server_video_processing: number;
  email_automation: number;
  email_failure_alerts: number;
  email_post_summary: number;
  weekly_posting_goal: number;
  free_posts_used: number;
  upsell_dismissed: number;
  first_subscribed_at: string | null;
  session_epoch: number;
  created_at: string;
};

const SESSION_COOKIE = "pt_session";
const SESSION_DAYS = 30;

function secret(): Buffer {
  const file = path.join(DATA_DIR, "secret");
  if (!existsSync(file)) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(file, "utf8").trim(), "hex");
}

export function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export function makeSessionToken(userId: string, epoch: number): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${userId}.${epoch}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined): { userId: string; epoch: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, epoch, exp, mac] = parts;
  const payload = `${userId}.${epoch}.${exp}`;
  if (sign(payload) !== mac) return null;
  if (Date.now() > Number(exp)) return null;
  return { userId, epoch: Number(epoch) };
}

export async function setSessionCookie(userId: string, epoch: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, makeSessionToken(userId, epoch), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const parsed = parseSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  const user = getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(parsed.userId) as User | undefined;
  if (!user) return null;
  if (user.session_epoch !== parsed.epoch) return null; // "Sign out all devices" bumps the epoch
  return user;
}

/** Route guard: must be signed in. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  return user;
}

/** Route guard: dashboard hard gate — un-onboarded users are sent to the wizard. */
export async function requireOnboardedUser(): Promise<User> {
  const user = await requireUser();
  if (!user.onboarded_at) redirect("/onboarding/connect");
  return user;
}

export function createUser(opts: {
  email: string;
  password?: string;
  displayName?: string;
  timezone?: string;
  avatarUrl?: string;
}): User {
  const db = getDb();
  const id = uid();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, avatar_url, timezone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.email.toLowerCase().trim(),
    opts.password ? hashPassword(opts.password) : null,
    opts.displayName ?? opts.email.split("@")[0],
    opts.avatarUrl ?? null,
    opts.timezone || "UTC",
    ts
  );
  // Default workspace "Main" with the observed default queue slots (11:00 & 16:00, Mon–Fri)
  const wsId = uid();
  db.prepare(
    "INSERT INTO workspaces (id, owner_id, name, webhook_secret, created_at) VALUES (?, ?, 'Main', ?, ?)"
  ).run(wsId, id, randomBytes(24).toString("hex"), ts);
  db.prepare(
    "INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)"
  ).run(wsId, id, ts);
  const slot = getDb().prepare(
    "INSERT INTO queue_slots (workspace_id, time_local, days, created_at) VALUES (?, ?, '1111100', ?)"
  );
  slot.run(wsId, "11:00", ts);
  slot.run(wsId, "16:00", ts);
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

export function findUserByEmail(email: string): User | null {
  return (getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) ?? null) as User | null;
}
