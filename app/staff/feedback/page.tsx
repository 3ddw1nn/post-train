import { requireStaffUser } from "@/lib/auth";
import { listRecords } from "@/lib/db";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Staff — Feedback" };

type UserRow = { id: string; email: string; display_name: string };
type FeedbackRow = { id: string; user_id: string; body: string; created_at: string };

export default async function StaffFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStaffUser();
  const { q } = await searchParams;
  const [items, users] = await Promise.all([
    listRecords<FeedbackRow>("feedback"),
    listRecords<UserRow>("users"),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const query = (q ?? "").trim().toLowerCase();

  // ponytail: naive full-table scan/filter — fine at this feedback volume; upgrade to a
  // Convex search index (or paginate) once it grows past a few hundred.
  const results = items
    .filter((f) => {
      if (!query) return true;
      const u = userById.get(f.user_id);
      return (
        f.body.toLowerCase().includes(query) ||
        (u ? u.email.toLowerCase().includes(query) || (u.display_name ?? "").toLowerCase().includes(query) : false)
      );
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Feedback</h1>

      <form className="mt-4 flex gap-2" action="/staff/feedback">
        <input type="text" name="q" defaultValue={q} placeholder="Search feedback or user…" className="input" />
        <button className="btn-primary" type="submit">
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        {results.map((f) => {
          const u = userById.get(f.user_id);
          return (
            <div key={f.id} className="card p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-semibold text-ink">{u ? u.display_name || u.email : f.user_id}</span>
                <span>{relativeTime(f.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{f.body}</p>
            </div>
          );
        })}
        {results.length === 0 && <p className="card p-6 text-center text-sm text-muted">No feedback found.</p>}
      </div>
    </div>
  );
}
