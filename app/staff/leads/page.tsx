import Link from "next/link";
import { requireStaffUser } from "@/lib/auth";
import { listRecords } from "@/lib/db";
import { Pill } from "@/components/ui";
import { LeadDetail } from "@/components/interactive";

export const metadata = { title: "Staff — Leads" };

type LeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string | null;
  status: string;
  source: string | null;
  page_path: string | null;
  referrer: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, "success" | "neutral" | "warning" | "locked" | "info"> = {
  new: "info",
  contacted: "warning",
  qualified: "success",
  unqualified: "neutral",
  converted: "success",
  lost: "locked",
};

export default async function StaffLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; leadId?: string }>;
}) {
  await requireStaffUser();
  const { q, status, leadId } = await searchParams;
  const allLeads = await listRecords<LeadRow>("leads");
  const query = (q ?? "").trim().toLowerCase();

  // ponytail: naive full-table scan/filter — fine at this lead volume; upgrade to a
  // Convex search index (or paginate) once leads grow past a few hundred.
  const results = allLeads
    .filter((l) => !status || l.status === status)
    .filter(
      (l) =>
        !query ||
        l.name.toLowerCase().includes(query) ||
        l.email.toLowerCase().includes(query) ||
        (l.company ?? "").toLowerCase().includes(query) ||
        (l.message ?? "").toLowerCase().includes(query)
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const detail = leadId ? results.find((l) => l.id === leadId) ?? allLeads.find((l) => l.id === leadId) : null;
  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    Object.entries(extra).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    return `?${params.toString()}`;
  };

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Leads</h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form className="flex gap-2" action="/staff/leads">
          {status && <input type="hidden" name="status" value={status} />}
          <input type="text" name="q" defaultValue={q} placeholder="Search name, email, company…" className="input" />
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
              {s}
            </Link>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-page/50 text-left text-xs font-bold uppercase text-muted">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {results.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-4 py-2">{l.name}</td>
                <td className="px-4 py-2">{l.email}</td>
                <td className="px-4 py-2">
                  <Pill tone={STATUS_TONE[l.status] ?? "neutral"}>{l.status}</Pill>
                </td>
                <td className="px-4 py-2 text-muted">{l.source ?? "—"}</td>
                <td className="px-4 py-2">{new Date(l.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={qs({ leadId: l.id })} className="btn-subtle !px-2 !py-1 text-xs">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  No leads found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="card mt-4 grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{detail.name}</p>
                <p className="text-sm text-muted">{detail.email}</p>
              </div>
              <Pill tone={STATUS_TONE[detail.status] ?? "neutral"}>{detail.status}</Pill>
            </div>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              {detail.phone && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Phone</dt>
                  <dd>{detail.phone}</dd>
                </div>
              )}
              {detail.company && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Company</dt>
                  <dd>{detail.company}</dd>
                </div>
              )}
              {detail.message && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Message</dt>
                  <dd className="whitespace-pre-wrap">{detail.message}</dd>
                </div>
              )}
              {detail.page_path && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Page</dt>
                  <dd>{detail.page_path}</dd>
                </div>
              )}
              {detail.referrer && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Referrer</dt>
                  <dd className="truncate">{detail.referrer}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted">Created</dt>
                <dd>{new Date(detail.created_at).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
          <LeadDetail leadId={detail.id} status={detail.status} notes={detail.notes} />
        </div>
      )}
    </div>
  );
}
