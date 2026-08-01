import Link from "next/link";
import { requireStaffUser } from "@/lib/auth";
import { listRecords } from "@/lib/db";
import { listMedia } from "@/lib/media";
import { formatBytes } from "@/lib/format";
import { MediaThumb } from "@/components/media";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";

export const metadata = { title: "Staff — Libraries" };

type UserRow = { id: string; email: string; display_name: string };
type WorkspaceRow = { id: string; name: string };
type MemberRow = { workspace_id: string; user_id: string; role: string };

export default async function StaffLibrariesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; userId?: string; workspaceId?: string }>;
}) {
  await requireStaffUser();
  const { q, userId, workspaceId } = await searchParams;
  const allUsers = await listRecords<UserRow>("users");
  const query = (q ?? "").trim().toLowerCase();
  // ponytail: naive full-table scan/filter — fine at this user count; upgrade to a
  // Convex search index (or paginate) once the user base grows past a few hundred.
  const results = query
    ? allUsers.filter(
        (u) => u.email.toLowerCase().includes(query) || (u.display_name ?? "").toLowerCase().includes(query)
      )
    : allUsers;

  const selectedUser = userId ? allUsers.find((u) => u.id === userId) : null;
  let workspaces: WorkspaceRow[] = [];
  if (selectedUser) {
    const [memberships, allWorkspaces] = await Promise.all([
      listRecords<MemberRow>("workspace_members", { user_id: selectedUser.id }),
      listRecords<WorkspaceRow>("workspaces"),
    ]);
    workspaces = memberships
      .map((m) => allWorkspaces.find((w) => w.id === m.workspace_id))
      .filter((w): w is WorkspaceRow => !!w);
  }
  const selectedWorkspace =
    workspaceId && workspaces.find((w) => w.id === workspaceId)
      ? workspaces.find((w) => w.id === workspaceId)!
      : null;
  const media = selectedWorkspace ? (await listMedia(selectedWorkspace.id, 200)).data : [];

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">Libraries</h1>

      <form className="mt-4 flex gap-2" action="/staff/libraries">
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
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {results.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.display_name || "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/staff/libraries?q=${encodeURIComponent(q ?? "")}&userId=${u.id}`}
                    className="btn-subtle !px-2 !py-1 text-xs"
                  >
                    View library
                  </Link>
                </td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="card mt-4 p-5">
          <p className="font-bold">{selectedUser.display_name || selectedUser.email}'s workspaces</p>
          {workspaces.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No workspaces.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {workspaces.map((w) => (
                <Link
                  key={w.id}
                  href={`/staff/libraries?q=${encodeURIComponent(q ?? "")}&userId=${selectedUser.id}&workspaceId=${w.id}`}
                  className={`pill flex items-center gap-1.5 ${
                    w.id === selectedWorkspace?.id ? "bg-primary-soft text-primary-deep" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  <Icon name="home" size={12} /> {w.name}
                </Link>
              ))}
            </div>
          )}

          {selectedWorkspace && (
            <div className="mt-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                {media.length} item{media.length === 1 ? "" : "s"}
                <Pill tone="neutral">{selectedWorkspace.name}</Pill>
              </p>
              {media.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No media uploaded to this workspace.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {media.map((m) => (
                    <div key={m.id} className="card overflow-hidden">
                      <div className="bg-page [&>img]:rounded-none [&>video]:rounded-none">
                        <MediaThumb media={m} size={0} full />
                      </div>
                      <div className="p-2">
                        <p className="truncate text-xs font-semibold" title={m.name}>
                          {m.name}
                        </p>
                        <p className="text-[11px] text-muted">{formatBytes(m.size_bytes)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
