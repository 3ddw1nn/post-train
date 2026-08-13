import { insertRecord, findRecord, patchRecord, now, uid } from "@/lib/db";
import { resolveChatSessionKey } from "@/lib/chat-session";
import { queueEmailToAddress } from "@/lib/emails";
import { waitlistConfirmationEmail } from "@/lib/email-templates";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LeadRow = { id: string; name: string; status: string };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  // Name is optional: the marketing chat lead form collects it, but the
  // waitlist form (source "waitlist") only asks for an email.
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  const emailRaw = typeof body?.email === "string" ? body.email.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) || null : null;
  const source = typeof body?.source === "string" ? body.source.slice(0, 100) : null;
  const pagePath = typeof body?.pagePath === "string" ? body.pagePath.slice(0, 300) : null;
  const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 300) : null;

  if (!EMAIL_PATTERN.test(emailRaw)) {
    return Response.json({ error: { message: "A valid email is required." } }, { status: 400 });
  }
  const email = emailRaw.toLowerCase();
  const { sessionKey } = await resolveChatSessionKey();
  const timestamp = now();

  // Duplicate handling: refresh the existing lead instead of creating noise. Don't
  // reveal to the caller whether the email already existed.
  const existing = await findRecord<LeadRow>("leads", { email });
  if (existing) {
    await patchRecord("leads", existing.id, {
      name: name || existing.name,
      message,
      source,
      page_path: pagePath,
      referrer,
      session_key: sessionKey,
      status: existing.status === "lost" ? "new" : existing.status,
      updated_at: timestamp,
    });
  } else {
    await insertRecord("leads", {
      id: uid(),
      name,
      email,
      phone: null,
      company: null,
      message,
      status: "new",
      source,
      page_path: pagePath,
      referrer,
      session_key: sessionKey,
      notes: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    // Confirmation only on a genuinely new waitlist signup — not on a
    // resubmit (handled above as a patch) and not for other lead sources
    // (the marketing chat's contact form), which don't promise a reply here.
    if (source === "waitlist") {
      const { subject, body: emailBody } = waitlistConfirmationEmail();
      await queueEmailToAddress(email, "waitlist_confirmation", subject, emailBody);
    }
  }

  return Response.json({ ok: true });
}
