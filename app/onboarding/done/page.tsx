import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { FinishButton } from "./finish-button";

export const metadata = { title: "You're all set" };

const RECAP = [
  { icon: "send", title: "Cross-platform publishing", desc: "One post, every connected account." },
  { icon: "clock", title: "Posting queue", desc: "Your weekly slots, filled automatically." },
  { icon: "chart", title: "Analytics", desc: "Views, likes and shares, synced on demand." },
  { icon: "stack", title: "Batch scheduler", desc: "A folder of clips, a week of posts." },
];

export default async function OnboardingDone() {
  await requireUser();
  return (
    <div className="fade-up mx-auto flex max-w-2xl flex-col items-center text-center">
      <img src="/logo-light.svg" alt="Post Train" className="h-16 w-16" />
      <h1 className="mt-6 text-3xl font-bold">You're all set!</h1>
      <p className="mt-2 max-w-md text-muted">
        Your workspace is ready. Here&apos;s what&apos;s waiting for you on board.
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {RECAP.map((r) => (
          <div key={r.title} className="card flex items-start gap-3 p-4 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-page text-primary-deep">
              <Icon name={r.icon} size={17} strokeWidth={1.8} />
            </span>
            <span>
              <span className="block font-bold">{r.title}</span>
              <span className="block text-sm text-muted">{r.desc}</span>
            </span>
          </div>
        ))}
      </div>

      <FinishButton />
    </div>
  );
}
