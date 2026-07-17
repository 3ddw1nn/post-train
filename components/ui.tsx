import Link from "next/link";
import { Icon } from "./icons";

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "neutral" | "warning" | "locked" | "info" | "beta";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    success: "bg-primary-soft text-primary-deep",
    neutral: "bg-gray-100 text-gray-600",
    warning: "bg-warning-bg text-warning-ink",
    locked: "bg-orange-100 text-orange-700",
    info: "bg-blue-50 text-blue-700",
    beta: "bg-violet-50 text-violet-700",
  };
  return <span className={`pill ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  cta,
}: {
  icon?: string;
  title: string;
  subtitle?: React.ReactNode;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      {icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-page text-muted">
          <Icon name={icon} size={26} />
        </span>
      )}
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="max-w-md text-sm text-muted">{subtitle}</p>}
      {cta && (
        <Link href={cta.href} className="btn-primary mt-2">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="inline-flex cursor-help text-muted" title={text}>
      <Icon name="info" size={14} />
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    draft: { tone: "bg-gray-100 text-gray-600", label: "Draft" },
    scheduled: { tone: "bg-blue-50 text-blue-700", label: "Scheduled" },
    processing: { tone: "bg-amber-50 text-amber-700", label: "Processing" },
    posted: { tone: "bg-primary-soft text-primary-deep", label: "Posted" },
    failed: { tone: "bg-red-50 text-red-700", label: "Failed" },
  };
  const s = map[status] ?? map.draft;
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}

export function Tabs({
  tabs,
  active,
}: {
  tabs: { label: string; href: string; key: string }[];
  active: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            t.key === active
              ? "border-primary text-ink"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
