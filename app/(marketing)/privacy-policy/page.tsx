import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata = { title: "Privacy Policy" };

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Scope",
    content: <p>This Privacy Policy explains how Post Train collects, uses, discloses, and protects personal information when you visit posttrain.app, create an account, use our web application, contact us, or connect a third-party account. It does not govern the privacy practices of social platforms or other services you choose to connect; their own notices apply to their services.</p>,
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    content: <>
      <p>We collect information you provide directly, including your name, email address, password-derived authentication data, workspace details, support messages, preferences, billing-plan selections, and the content, media, captions, schedules, and other material you choose to create or upload.</p>
      <p>When you connect a social account, we receive the account details and authorization tokens made available by that platform. We do not ask for or store your social-media password. We also collect technical and service information needed to operate and secure Post Train, such as session identifiers, IP-derived security signals, browser and device information, logs, and records of actions taken in the product.</p>
    </>,
  },
  {
    id: "how-we-use-information",
    title: "How we use information",
    content: <>
      <p>We use personal information to provide the service: authenticate you, maintain workspaces, store and process your content, publish or schedule content at your direction, connect accounts, provide analytics where available, process subscriptions, communicate about your account, respond to support requests, and protect the service from misuse.</p>
      <p>We may use aggregated or de-identified information to understand service performance and improve Post Train. We do not sell or rent personal information.</p>
    </>,
  },
  {
    id: "service-providers",
    title: "When we share information",
    content: <>
      <p>We share information only as needed to operate the service, including with payment processors, cloud hosting and storage providers, email and customer-support providers, AI or media-processing providers you choose to use through product features, and social platforms you direct us to connect or publish to.</p>
      <p>We may also disclose information when required by law, to protect the rights, safety, or security of Post Train, our users, or others, or in connection with a corporate transaction such as a merger, acquisition, financing, or sale of assets. Service providers may use information only to provide services to us or as otherwise permitted by their own agreements and applicable law.</p>
    </>,
  },
  {
    id: "connected-accounts",
    title: "Connected accounts & content",
    content: <>
      <p>Connected-account permissions are controlled through each platform’s official authorization flow. We use the authorization you grant to perform the actions you request, such as reading account information, publishing content, or retrieving analytics. You may disconnect an account in Post Train; you may also revoke access through the connected platform’s settings.</p>
      <p>You are responsible for ensuring that you have the rights and permissions needed to upload, process, schedule, and publish your content. Content may be transmitted to the platforms and service providers required to complete the action you request.</p>
    </>,
  },
  {
    id: "cookies",
    title: "Cookies & similar technologies",
    content: <p>We use essential cookies and similar technologies to keep you signed in, maintain security, remember service preferences, and operate core functionality. Your browser may allow you to limit or remove cookies, but essential parts of Post Train may not work properly if you do.</p>,
  },
  {
    id: "retention-security",
    title: "Retention & security",
    content: <>
      <p>We retain information for as long as reasonably necessary to provide the service, meet legal and accounting obligations, resolve disputes, enforce our agreements, and protect against abuse. Workspace deletion removes the workspace data handled by that feature; some information may remain in backups or logs for a limited period.</p>
      <p>We use reasonable administrative, technical, and organizational safeguards designed to protect information. For example, platform credentials are stored encrypted. No system is completely secure, and we cannot guarantee absolute security.</p>
    </>,
  },
  {
    id: "your-choices",
    title: "Your choices & privacy rights",
    content: <>
      <p>You can update account settings, disconnect social accounts, manage marketing preferences, and delete workspaces through Post Train. Depending on where you live, you may have rights to request access to, correction of, deletion of, or a portable copy of your personal information, or to object to or restrict certain processing.</p>
      <p>To make a privacy request, email <a className="font-semibold text-primary-deep underline underline-offset-2" href="mailto:ehleedev@gmail.com?subject=Privacy%20request">ehleedev@gmail.com</a>. We may need to verify your request before acting on it. We will not discriminate against you for exercising applicable privacy rights.</p>
    </>,
  },
  {
    id: "children-changes-contact",
    title: "Children, changes & contact",
    content: <>
      <p>Post Train is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided personal information to us, contact us and we will take appropriate steps to delete it.</p>
      <p>We may update this Policy as our service or legal obligations change. We will post the revised version here and update the effective date. For questions about this Policy, contact <a className="font-semibold text-primary-deep underline underline-offset-2" href="mailto:ehleedev@gmail.com?subject=Privacy%20question">ehleedev@gmail.com</a>.</p>
    </>,
  },
];

export default function PrivacyPage() {
  return <LegalDocument eyebrow="Legal / Privacy" title="Privacy Policy" summary="A clear account of the information Post Train needs to run, why we use it, and the controls available to you." sections={sections} />;
}
