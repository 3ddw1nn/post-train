const SUPPORT_EMAIL = "ehleedev@gmail.com";
const FROM_EMAIL = process.env.EMAIL_FROM || "no-reply@posttrain.app";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const message = String(body?.message ?? "").trim();
  if (!name || !email || !message) {
    return Response.json({ error: { message: "Fill in your name, email and message." } }, { status: 400 });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[contact] (dev, not sent) from ${name} <${email}>: ${message}`);
    return Response.json({ ok: true });
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Post Train Contact Form", email: FROM_EMAIL },
      to: [{ email: SUPPORT_EMAIL }],
      replyTo: { email, name },
      subject: `Contact form: ${name}`,
      textContent: message,
    }),
  });
  if (!res.ok) {
    console.error(`[contact] Brevo ${res.status}: ${await res.text()}`);
    return Response.json({ error: { message: "Could not send — try emailing us directly." } }, { status: 502 });
  }
  return Response.json({ ok: true });
}
