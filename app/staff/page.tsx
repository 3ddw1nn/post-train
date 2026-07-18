import Link from "next/link";
import { requireStaffUser } from "@/lib/auth";
import { getSubscription } from "@/lib/billing";
import { planLabel } from "@/lib/entitlements";
import { listRecords } from "@/lib/db";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";

export const metadata = { title: "Staff — Users" };

type UserRow = { id: string; email: string; display_name: string; is_staff?: number; created_at: string };
type WorkspaceRow = { id: string; name: string; owner_id: string };
type MemberRow = { workspace_id: string; user_id: string; role: string };
type AccountRow = { workspace_id: string; platform: string; username: string; status: string };

export default async function StaffUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; userId?: string }>;
}) {
  await requireStaffUser();
  const { q, userId } = await searchParams;
  const allUsers = await listRecords<UserRow>("users");
  const query = (q ?? "").trim().toLowerCase();
  // ponytail: naive full-table scan/filter — fine at this user count; upgrade to a
  // Convex search index (or paginate) once the user base grows past a few hundred.
  const results = query
    ? allUsers.filter(
        (u) => u.email.toLowerCase().includes(query) || (u.display_name ?? "").toLowerCase().includes(query)
      )
    : allUsers;

  let detail: {
    user: UserRow;
    sub: Awaited<ReturnType<typeof getSubscription>>;
    workspaces: { workspace: WorkspaceRow; role: string; accounts: AccountRow[] }[];
  } | null = null;

  if (userId) {
    const target = allUsers.find((u) => u.id === userId);
    if (target) {
      const [memberships, allWorkspaces, allAccounts, sub] = await Promise.all([
        listRecords<MemberRow>("workspace_members", { user_id: userId }),
        listRecords<WorkspaceRow>("workspaces"),
        listRecords<AccountRow>("social_accounts"),
        getSubscription(userId),
      ]);
      const workspaces = memberships
        .map((m) => {
          const workspace = allWorkspaces.find((w) => w.id === m.workspace_id);
          if (!workspace) return null;
          return { workspace, role: m.role, accounts: allAccounts.filter((a) => a.workspace_id === workspace.id) };
        })
        .filter((w): w is NonNullable<typeof w> => w !== null);
      detail = { user: target, sub, workspaces };
    }
  }

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Users</h1>
      <form className="mt-4 flex gap-2" action="/staff">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by email or name"
          className="input"
        />
        <button className="btn-primary" type="submit">
          Search
        </button>
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-page/50 text-left text-xs font-bold uppercase text-muted">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Joined</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {results.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    {u.display_name || "—"}
                    {!!u.is_staff && <Pill tone="success">Staff</Pill>}
                  </span>
                </td>
                <td className="px-4 py-2">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/staff?q=${encodeURIComponent(q ?? "")}&userId=${u.id}`}
                    className="btn-subtle !px-2 !py-1 text-xs"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="card mt-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">{detail.user.display_name || detail.user.email}</p>
              <p className="text-sm text-muted">{detail.user.email}</p>
            </div>
            <Pill tone={detail.sub ? "success" : "neutral"}>{planLabel(detail.sub)}</Pill>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {detail.workspaces.length === 0 && <p className="text-sm text-muted">No workspaces.</p>}
            {detail.workspaces.map(({ workspace, role, accounts }) => (
              <div key={workspace.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <Icon name="home" size={14} className="text-muted" />
                  <p className="font-semibold">{workspace.name}</p>
                  <span className="pill bg-gray-100 capitalize text-gray-600">{role}</span>
                </div>
                {accounts.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">No connected accounts.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {accounts.map((a, i) => (
                      <span key={i} className="pill bg-page text-xs">
                        {a.platform}: {a.username} ({a.status})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
