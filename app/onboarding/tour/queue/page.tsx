import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";

export const metadata = { title: "Stay consistent" };

const SLOTS = [
  { time: "11:00 AM", days: [true, true, true, true, true, false, false] },
  { time: "4:00 PM", days: [false, true, false, true, false, true, false] },
];

export default async function TourQueue() {
  await requireUser();
  return (
    <div className="fade-up mx-auto max-w-2xl">
      <Link
        href="/onboarding/tour/cross-post"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
      >
        <Icon name="chevronLeft" size={15} /> Back
      </Link>
      <h1 className="text-2xl font-bold">A queue that keeps you consistent</h1>
      <p className="mt-1 text-sm text-muted">
        Set your weekly posting slots once. Every new post grabs the next free one — no
        more remembering to hit publish.
      </p>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-page/50 px-5 py-3">
          <Icon name="clock" size={14} className="text-primary-deep" />
          <p className="text-sm font-bold">Queue schedule</p>
        </div>
        <div className="flex flex-col divide-y divide-line">
          {SLOTS.map((slot) => (
            <div key={slot.time} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-semibold">{slot.time}</span>
              <span className="flex gap-1.5">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span
                    key={i}
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      slot.days[i] ? "bg-primary text-primary-contrast" : "bg-page text-muted"
                    }`}
                  >
                    {d}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Next free slot: tomorrow 11:00 AM
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <Link href="/onboarding/connect" className="btn-primary px-11 py-[18px] text-xl">
          Continue
        </Link>
      </div>
    </div>
  );
}
