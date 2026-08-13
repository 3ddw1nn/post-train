// Self-contained HTML email templates for Brevo sends (lib/emails.ts).
// Table layout + inline styles only — Outlook and other clients don't
// reliably support <style> blocks or modern CSS, so nothing here can lean on
// globals.css or Tailwind.
import type { EmailBody } from "./emails";

const BRAND = {
  primary: "#0e8177",
  ink: "#1c1c1e",
  muted: "#6b7280",
  page: "#f4f6f6",
  line: "#e3e8e7",
};

function layout(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:${BRAND.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${BRAND.primary};color:#ffffff;font-weight:800;font-size:14px;line-height:32px;text-align:center;">PT</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;color:${BRAND.ink};">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="max-width:480px;margin:16px 0 0 0;font-size:12px;color:${BRAND.muted};">
            Post Train &middot; you&rsquo;re receiving this because you joined our waitlist.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function waitlistConfirmationEmail(): { subject: string; body: EmailBody } {
  const subject = "You're on the Post Train waitlist";
  const text = [
    "You're on the list!",
    "",
    "We're still finishing Post Train — one caption, tuned and scheduled across every " +
      "platform you post to. We'll email you the moment a spot opens up.",
    "",
    "— The Post Train team",
  ].join("\n");
  const html = layout(`
    <h1 style="margin:0 0 4px 0;font-size:20px;font-weight:800;">You&rsquo;re on the list</h1>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:22px;color:${BRAND.muted};">
      We&rsquo;ll email you the moment a spot opens up &mdash; no need to do anything else.
    </p>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:22px;">
      Post Train turns one caption into a post tuned for every platform you use, then ships
      it out on schedule &mdash; no more copy-pasting the same update six times.
    </p>
    <p style="margin:0;font-size:13px;line-height:20px;color:${BRAND.muted};">
      &mdash; The Post Train team
    </p>
  `);
  return { subject, body: { text, html } };
}
