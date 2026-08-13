// Transactional email: outbox table (audit trail) + Brevo delivery.
// Without BREVO_API_KEY set, emails only land in the outbox + console (dev mode).
import { convexMutation, convexQuery, uid } from "./db";
import { api } from "@/convex/_generated/api";

const FROM_EMAIL = process.env.EMAIL_FROM || "no-reply@posttrain.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Post Train";

export type EmailBody = {
  text: string;
  /** Optional HTML alternative. Brevo sends a multipart email when both are
   *  present; text-only when omitted, same as every call site before this. */
  html?: string;
};

async function sendViaBrevo(to: { email: string; name?: string }, subject: string, body: EmailBody, kind: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[email:${kind}] (dev, not sent) to ${to.email}: ${subject}`);
    return;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [to],
        subject,
        textContent: body.text,
        ...(body.html ? { htmlContent: body.html } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[email:${kind}] Brevo ${res.status}: ${await res.text()}`);
    }
  } catch (e) {
    // Email failure must never break the calling flow (signup, publish, etc.)
    console.error(`[email:${kind}] send failed`, e);
  }
}

/** Email a registered user. `body` may be a plain string (existing callers)
 *  or `{ text, html }` for a templated send. */
export async function queueEmail(userId: string, kind: string, subject: string, body: string | EmailBody) {
  const content: EmailBody = typeof body === "string" ? { text: body } : body;
  await convexMutation(api.records.enqueueEmail, {
    id: uid(),
    user_id: userId,
    kind,
    subject,
    body: content.text,
  });

  const user = await convexQuery<{ email: string; display_name?: string | null } | null>(api.auth.getUserById, {
    id: userId,
  });
  if (!user?.email) return;
  await sendViaBrevo({ email: user.email, name: user.display_name ?? undefined }, subject, content, kind);
}

/**
 * Email an address with no account behind it — a waitlist signup, an
 * unconverted lead. Same outbox + Brevo path as queueEmail, keyed by
 * to_email instead of user_id since there's no user row to look up.
 */
export async function queueEmailToAddress(email: string, kind: string, subject: string, body: string | EmailBody) {
  const content: EmailBody = typeof body === "string" ? { text: body } : body;
  await convexMutation(api.records.enqueueEmail, {
    id: uid(),
    to_email: email,
    kind,
    subject,
    body: content.text,
  });
  await sendViaBrevo({ email }, subject, content, kind);
}
