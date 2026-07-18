// Transactional email: outbox table (audit trail) + Brevo delivery.
// Without BREVO_API_KEY set, emails only land in the outbox + console (dev mode).
import { convexMutation, convexQuery, uid } from "./db";
import { api } from "@/convex/_generated/api";

const FROM_EMAIL = process.env.EMAIL_FROM || "no-reply@posttrain.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Post Train";

export async function queueEmail(userId: string, kind: string, subject: string, body: string) {
  await convexMutation(api.records.enqueueEmail, { id: uid(), user_id: userId, kind, subject, body });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[email:${kind}] (dev, not sent) to user ${userId}: ${subject}`);
    return;
  }
  try {
    const user = await convexQuery<{ email: string } | null>(api.auth.getUserById, { id: userId });
    if (!user?.email) return;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: user.email }],
        subject,
        textContent: body,
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
