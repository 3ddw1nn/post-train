import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata = { title: "Terms of Service" };

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement to these Terms",
    content: <p>These Terms of Service govern your use of Post Train. By creating an account, accessing the service, or using any feature, you agree to these Terms and our Privacy Policy. If you use Post Train for an organization, you represent that you have authority to bind that organization and “you” includes that organization.</p>,
  },
  {
    id: "service",
    title: "The service",
    content: <p>Post Train is a tool for creating, organizing, scheduling, and publishing content across supported third-party platforms. Features, platform availability, and analytics may change as third-party services, technical requirements, and applicable rules change. We may modify, add, or discontinue features with reasonable notice when practicable.</p>,
  },
  {
    id: "accounts-workspaces",
    title: "Accounts & workspaces",
    content: <>
      <p>You must provide accurate information, protect your login credentials, and promptly notify us of suspected unauthorized use. You are responsible for activity performed through your account and for people you invite to a workspace.</p>
      <p>Workspace owners control their workspace content, members, and connected accounts. Before inviting someone or connecting an account, make sure you have the authority to do so.</p>
    </>,
  },
  {
    id: "third-party-platforms",
    title: "Third-party platforms",
    content: <p>Post Train is not affiliated with or endorsed by the social platforms you connect. Your use of each connected platform remains subject to that platform’s terms, policies, technical limits, and enforcement decisions. You authorize Post Train to act on your instructions using the permissions you grant. We are not responsible for a platform’s availability, changes, moderation, account restrictions, or refusal to publish content.</p>,
  },
  {
    id: "content-ai",
    title: "Your content & AI features",
    content: <>
      <p>You retain ownership of your content. You grant Post Train a limited, non-exclusive, worldwide license to host, reproduce, modify solely for technical processing, and transmit your content only as necessary to provide and improve the service and carry out your instructions.</p>
      <p>You are responsible for content you upload, generate, schedule, copy, or publish, including obtaining all rights, permissions, releases, and consents required to use it. AI-assisted output may be inaccurate, incomplete, or unsuitable; review it before use. Do not use the service to impersonate others, infringe rights, create deceptive content, or violate applicable law or platform rules.</p>
    </>,
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: <p>You may not use Post Train to send spam, evade platform restrictions, interfere with the service, probe or bypass security controls, scrape or collect data unlawfully, upload malware, harass or threaten others, exploit minors, infringe intellectual-property or privacy rights, or otherwise use the service unlawfully. We may investigate violations and suspend or terminate access where reasonably necessary to protect the service, users, or third parties.</p>,
  },
  {
    id: "billing",
    title: "Plans, trials & billing",
    content: <>
      <p>Paid plans, trials, usage limits, and pricing are presented at checkout or in the product. Payments are processed by Stripe and may be subject to Stripe’s terms. Unless stated otherwise at checkout, subscriptions renew automatically until cancelled. You are responsible for applicable taxes and for keeping billing details current.</p>
      <p>You can cancel a subscription through the available billing controls. Cancellation normally takes effect at the end of the current billing period. Where a refund is offered, it is handled according to the refund terms presented at the time of purchase and any non-waivable consumer rights that apply to you.</p>
      <p>Subscription charges may be refunded within 7 days of the charge, no questions asked; refunding a subscription charge cancels it immediately. AI credit top-ups are a separate, one-time purchase and follow their own rule: only the single most recent top-up is refundable, only within 48 hours of that purchase, and only if none of the credits it added have been spent — once you&apos;ve used any of them, or the window has passed, that purchase can no longer be refunded. A top-up refund removes the corresponding credits from your balance.</p>
    </>,
  },
  {
    id: "ownership-feedback",
    title: "Our rights & feedback",
    content: <p>Post Train, its software, branding, and service materials are owned by Post Train or its licensors and are protected by applicable intellectual-property laws. These Terms give you a limited, non-transferable right to use the service as permitted here; they do not transfer ownership. If you provide feedback, you grant us the right to use it without restriction or compensation.</p>,
  },
  {
    id: "disclaimers-liability",
    title: "Disclaimers & liability",
    content: <>
      <p>Post Train is provided on an “as is” and “as available” basis. To the maximum extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free operation. We do not guarantee publishing outcomes, platform performance, audience results, or that the service will meet every need.</p>
      <p>To the maximum extent permitted by law, Post Train will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, data, goodwill, or business opportunity. Our total liability for claims relating to the service will not exceed the fees you paid to Post Train for the service in the 12 months before the event giving rise to the claim. Nothing in these Terms limits liability that cannot legally be limited.</p>
    </>,
  },
  {
    id: "suspension-termination",
    title: "Suspension & termination",
    content: <p>You may stop using Post Train at any time. We may suspend or terminate access if you materially violate these Terms, create risk or legal exposure for us or others, or if required by law. On termination, your right to use the service ends. Provisions that by their nature should survive—including ownership, disclaimers, limitations of liability, and dispute-related terms—will survive.</p>,
  },
  {
    id: "changes-contact",
    title: "Changes & contact",
    content: <>
      <p>We may update these Terms from time to time. If a change is material, we will provide reasonable notice through the service, by email, or by another appropriate method. Continued use after the effective date of updated Terms means you accept them, to the extent permitted by law.</p>
      <p>Questions about these Terms can be sent to <a className="font-semibold text-primary-deep underline underline-offset-2" href="mailto:ehleedev@gmail.com?subject=Terms%20question">ehleedev@gmail.com</a>.</p>
    </>,
  },
];

export default function TosPage() {
  return <LegalDocument eyebrow="Legal / Service" title="Terms of Service" summary="The ground rules for using Post Train, managing workspaces, connecting platforms, and subscribing to paid plans." sections={sections} />;
}
