import Link from "next/link";
import { requireStaffUser } from "@/lib/auth";
import { listRecords } from "@/lib/db";
import { Pill } from "@/components/ui";

export const metadata = { title: "Staff — Billing" };

type UserRow = { id: string; email: string; display_name: string };
type SubscriptionRow = {
  id: string;
  user_id: string;
  plan: string;
  interval: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "paused";
  cancel_at_period_end: number;
  current_period_end: string | null;
};

const STATUS_TONE: Record<string, "success" | "neutral" | "warning" | "locked" | "info"> = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  canceled: "locked",
  paused: "neutral",
};

export default async function StaffBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireStaffUser();
  const { q, status } = await searchParams;
  const [subs, users] = await Promise.all([
    listRecords<SubscriptionRow>("subscriptions"),
    listRecords<UserRow>("users"),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const query = (q ?? "").trim().toLowerCase();

  // ponytail: naive full-table scan/filter — fine at this subscription count; upgrade to a
  // Convex search index (or paginate) once it grows past a few hundred.
  const results = subs
    .filter((s) => !status || s.status === status)
    .filter((s) => {
      if (!query) return true;
      const u = userById.get(s.user_id);
      return u ? u.email.toLowerCase().includes(query) || (u.display_name ?? "").toLowerCase().includes(query) : false;
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));

  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    Object.entries(extra).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    return `?${params.toString()}`;
  };

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Billing</h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form className="flex gap-2" action="/staff/billing">
          {status && <input type="hidden" name="status" value={status} />}
          <input type="text" name="q" defaultValue={q} placeholder="Search name or email…" className="input" />
          <button className="btn-primary" type="submit">
            Search
          </button>
        </form>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Link href={qs({ status: undefined })} className={`pill ${!status ? "bg-primary-soft text-primary-deep" : "bg-gray-100 text-gray-600"}`}>
            All
          </Link>
          {Object.keys(STATUS_TONE).map((s) => (
            <Link
              key={s}
              href={qs({ status: s })}
              className={`pill capitalize ${status === s ? "bg-primary-soft text-primary-deep" : "bg-gray-100 text-gray-600"}`}
            >
              {s.replace("_", " ")}
            </Link>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-page/50 text-left text-xs font-bold uppercase text-muted">
            <tr>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Interval</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Renews / ends</th>
            </tr>
          </thead>
          <tbody>
            {results.map((s) => {
              const u = userById.get(s.user_id);
              return (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-4 py-2">{u ? u.display_name || u.email : s.user_id}</td>
                  <td className="px-4 py-2 capitalize">{s.plan}</td>
                  <td className="px-4 py-2 capitalize">{s.interval}</td>
                  <td className="px-4 py-2">
                    <Pill tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status.replace("_", " ")}</Pill>
                    {!!s.cancel_at_period_end && <span className="ml-1.5 text-xs text-muted">(cancels)</span>}
                  </td>
                  <td className="px-4 py-2">
                    {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No subscriptions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
