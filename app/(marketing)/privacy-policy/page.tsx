export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed">
      <h1 className="text-3xl font-extrabold">Privacy Policy</h1>
      <p className="mt-2 text-xs text-muted">
        Placeholder policy for this reference build — have real counsel review before any
        launch.
      </p>
      {[
        ["What we collect", "Account details (email, name), content you upload, social account metadata and OAuth tokens for the platforms you connect, and product usage needed to run the service."],
        ["What we never collect", "Your social media passwords. Connections always go through each platform's official sign-in, and tokens are revocable by you at any time."],
        ["How we use it", "To publish your content where you tell us to, bill your subscription, send the emails you've toggled on, and keep the service working. We don't sell personal data."],
        ["Storage & security", "Content and tokens are stored encrypted at rest in production. Media you upload is served from a CDN so platforms can ingest it."],
        ["Your controls", "Export or delete your data anytime by contacting support. Disconnecting an account revokes our access immediately."],
      ].map(([h, b]) => (
        <section key={h} className="mt-6">
          <h2 className="font-bold">{h}</h2>
          <p className="mt-1 text-muted">{b}</p>
        </section>
      ))}
    </article>
  );
}
