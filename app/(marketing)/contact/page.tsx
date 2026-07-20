import { Icon } from "@/components/icons";
import { ContactForm } from "./contact-form";

export const metadata = {
  title: "Contact us — Post Train",
  description: "Questions, feature requests, or something broken — get in touch.",
};

const CHANNELS: { icon: string; title: string; desc: string; href?: string }[] = [
  {
    icon: "mail",
    title: "Email",
    desc: "ehleedev@gmail.com",
    href: "mailto:ehleedev@gmail.com",
  },
  {
    icon: "clock",
    title: "Response time",
    desc: "Usually within a few hours",
  },
  {
    icon: "chat",
    title: "In-app chat",
    desc: "The chat bubble in your dashboard reaches the same inbox",
  },
];

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Get in touch</h1>
          <p className="mt-3 max-w-sm text-muted">
            Questions, feature requests, or something broken — a real person reads every
            message that comes through here.
          </p>

          <div className="mt-8 flex flex-col gap-4">
            {CHANNELS.map((c) => {
              const content = (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-primary-deep">
                    <Icon name={c.icon} size={18} strokeWidth={1.8} />
                  </span>
                  <span>
                    <span className="block font-bold">{c.title}</span>
                    <span className="block text-sm text-muted">{c.desc}</span>
                  </span>
                </>
              );
              return c.href ? (
                <a key={c.title} href={c.href} className="flex items-center gap-3 hover:opacity-80">
                  {content}
                </a>
              ) : (
                <div key={c.title} className="flex items-center gap-3">
                  {content}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-line bg-page/50 px-6 py-4">
            <p className="text-sm font-bold">Send a message</p>
          </div>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
