// ponytail: transactional email = outbox table + console log. Upgrade path:
// swap queueEmail's body for a Resend/Postmark call; call sites stay unchanged.
import { getDb, now, uid } from "./db";

export function queueEmail(userId: string, kind: string, subject: string, body: string) {
  getDb()
    .prepare(
      "INSERT INTO emails_outbox (id, user_id, kind, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(uid(), userId, kind, subject, body, now());
  console.log(`[email:${kind}] to user ${userId}: ${subject}`);
}
