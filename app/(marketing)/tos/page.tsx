export const metadata = { title: "Terms of Service" };

export default function TosPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed">
      <h1 className="text-3xl font-extrabold">Terms of Service</h1>
      <p className="mt-2 text-xs text-muted">
        Placeholder terms for this reference build — have real counsel review before any
        launch.
      </p>
      {[
        ["1. The service", "Post Train lets you compose, schedule and publish content to third-party social platforms you connect. We are not affiliated with those platforms and can't control their behavior, outages or policy changes."],
        ["2. Your account", "You're responsible for your credentials and everything posted through your workspace. Don't use the service to spam, harass, infringe or break a connected platform's rules."],
        ["3. Your content", "You keep all rights to what you upload. You grant us only the license needed to store, process and transmit it to the platforms you select."],
        ["4. Copying third-party posts", "Features that reference an external post (for example, copying a public Instagram or TikTok slideshow as a starting point) read only publicly available data and are provided as a convenience. You are solely responsible for what you copy, generate and publish, for having the rights to use it, and for ensuring it is lawful and appropriate. Post Train is not responsible for third-party or user-generated content and does not endorse it. You must not use these features to reproduce private, infringing, deceptive, hateful, sexual, or otherwise inappropriate content, or to impersonate others. Violations of this policy may result in content removal, feature loss, suspension, or permanent termination of your account, at our sole discretion."],
        ["5. Billing", "Paid plans renew until cancelled. Trials convert at period end unless cancelled first. Refunds are honored within 7 days of a charge."],
        ["6. Termination", "You can delete your account anytime. We may suspend or permanently remove accounts that abuse the service, violate this policy, or break the platforms it connects to."],
        ["7. Warranty & liability", "The service is provided as-is. To the maximum extent permitted by law, our liability is limited to the fees you paid in the last 12 months."],
      ].map(([h, b]) => (
        <section key={h} className="mt-6">
          <h2 className="font-bold">{h}</h2>
          <p className="mt-1 text-muted">{b}</p>
        </section>
      ))}
    </article>
  );
}
