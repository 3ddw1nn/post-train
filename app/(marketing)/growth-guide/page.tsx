import Link from "next/link";

export const metadata = { title: "Growth guide" };

const SECTIONS: [string, string][] = [
  [
    "1. Pick a cadence you can survive",
    "Three posts a week you actually ship beats a daily plan you abandon by Thursday. Set your weekly goal in Settings and let the reminder emails keep you honest.",
  ],
  [
    "2. Batch creation, automate distribution",
    "Record or design in one sitting, then bulk-upload and let queue slots spread everything out. Creation is craft; distribution is logistics.",
  ],
  [
    "3. Native-ish beats identical",
    "Cross-post the same core content, but use per-platform captions: hashtags on Instagram, none on LinkedIn, 280 tight characters on X.",
  ],
  [
    "4. Short-form video is the compounding asset",
    "One vertical video works on TikTok, Reels, Shorts, Facebook and Pinterest simultaneously. That's five surfaces for one edit.",
  ],
  [
    "5. Read the analytics, not the dopamine",
    "Check the beta analytics weekly, not hourly. Double down on the format of your top 20% — ignore single-post spikes.",
  ],
];

export default function GrowthGuidePage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">The no-burnout growth guide</h1>
      <p className="mt-2 text-muted">
        Five habits that grow accounts without eating your life.
      </p>
      <div className="mt-8 flex flex-col gap-6">
        {SECTIONS.map(([title, body]) => (
          <section key={title} className="card p-6">
            <h2 className="font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </section>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Link href="/create-account" className="btn-primary !px-8 !py-3">
          Put it on rails — try Post Train free
        </Link>
      </div>
    </article>
  );
}
