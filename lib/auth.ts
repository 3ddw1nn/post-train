import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { now, uid, convexMutation, convexQuery } from "./db";
import { secretKey } from "./secretbox";
import { api } from "@/convex/_generated/api";

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
  is_staff?: number;
  created_at: string;
};

const SESSION_COOKIE = "pt_session";
const SESSION_DAYS = 30;

export function sign(data: string): string {
  return createHmac("sha256", secretKey()).update(data).digest("base64url");
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
  const user = await convexQuery<User | null>(api.auth.getUserById, { id: parsed.userId });
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

/** Route guard: founder/staff-only areas — everyone else is bounced to the dashboard. */
export async function requireStaffUser(): Promise<User> {
  const user = await requireUser();
  if (!user.is_staff) redirect("/dashboard");
  return user;
}

/** Route guard: dashboard hard gate — un-onboarded users are sent to the wizard. Staff bypass. */
export async function requireOnboardedUser(): Promise<User> {
  const user = await requireUser();
  if (!user.onboarded_at && !user.is_staff) redirect("/onboarding/connect");
  return user;
}

export async function createUser(opts: {
  email: string;
  password?: string;
  displayName?: string;
  timezone?: string;
  avatarUrl?: string;
}): Promise<User> {
  const id = uid();
  const wsId = uid();
  return await convexMutation<User>(api.users.createUser, {
    id,
    email: opts.email.toLowerCase().trim(),
    password_hash: opts.password ? hashPassword(opts.password) : null,
    display_name: opts.displayName ?? opts.email.split("@")[0],
    avatar_url: opts.avatarUrl ?? null,
    timezone: opts.timezone || "UTC",
    workspace_id: wsId,
    webhook_secret: randomBytes(24).toString("hex"),
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return await convexQuery<User | null>(api.auth.findUserByEmail, {
    email: email.toLowerCase().trim(),
  });
}
