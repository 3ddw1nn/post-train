import Link from "next/link";
import { requireStaffUser } from "@/lib/auth";
import { getR2BucketUsage, listR2Objects, R2_FREE_TIER_BYTES } from "@/lib/r2";
import { listRecords } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";
import { StorageFileRow } from "@/components/staff-storage";

export const metadata = { title: "Staff — R2 Storage" };

type WorkspaceRow = { id: string; name: string };

const MEDIA_KEY_RE = /^workspaces\/([^/]+)\/(image|video|pdf|audio)\/([^/]+)\.[^/.]+$/;

function folderName(folderPrefix: string, parentPrefix: string, nameById: Map<string, string>): string {
  const segment = folderPrefix.slice(parentPrefix.length).replace(/\/$/, "");
  return nameById.get(segment) ?? segment;
}

function breadcrumbs(prefix: string) {
  const segments = prefix.split("/").filter(Boolean);
  const crumbs = [{ label: "Storage", prefix: "" }];
  let running = "";
  for (const seg of segments) {
    running += `${seg}/`;
    crumbs.push({ label: seg, prefix: running });
  }
  return crumbs;
}

export default async function StaffStoragePage({
  searchParams,
}: {
  searchParams: Promise<{ prefix?: string; cursor?: string }>;
}) {
  await requireStaffUser();
  const { prefix = "", cursor } = await searchParams;
  const [listing, usage] = await Promise.all([listR2Objects(prefix, cursor), getR2BucketUsage()]);
  const usedPct = Math.min(100, (usage.bytes / R2_FREE_TIER_BYTES) * 100);

  const nameById = new Map<string, string>();
  if (prefix === "workspaces/") {
    const workspaces = await listRecords<WorkspaceRow>("workspaces");
    for (const w of workspaces) nameById.set(w.id, w.name);
  }

  const crumbs = breadcrumbs(prefix);

  return (
    <div className="fade-up">
      <h1 className="text-2xl font-bold">R2 storage</h1>

      <div className="card mt-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Pill tone="neutral">R2 bucket</Pill>
            {formatBytes(usage.bytes)} of {formatBytes(R2_FREE_TIER_BYTES)} used
          </span>
          <span className="text-xs font-semibold text-muted">
            {usedPct.toFixed(1)}% · {usage.objectCount} object{usage.objectCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-page">
          <div
            className={`h-full rounded-full ${usedPct >= 80 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${Math.max(usedPct, usage.bytes > 0 ? 1 : 0)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-muted">
        {crumbs.map((c, i) => (
          <span key={c.prefix} className="flex items-center gap-1">
            {i > 0 && <Icon name="chevronRight" size={12} />}
            {i === crumbs.length - 1 ? (
              <span className="font-semibold text-ink">{c.label}</span>
            ) : (
              <Link href={`/staff/storage?prefix=${encodeURIComponent(c.prefix)}`} className="hover:underline">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </div>

      {listing.folders.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {listing.folders.map((folder) => (
            <Link
              key={folder}
              href={`/staff/storage?prefix=${encodeURIComponent(folder)}`}
              className="card flex items-center gap-2 p-3 text-sm font-semibold hover:bg-page"
            >
              <Icon name="folder" size={18} className="text-muted" />
              <span className="truncate">{folderName(folder, prefix, nameById)}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-page/50 text-left text-xs font-bold uppercase text-muted">
            <tr>
              <th className="px-4 py-2">File</th>
              <th className="px-4 py-2">Size</th>
              <th className="px-4 py-2">Last modified</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {listing.files.map((f) => {
              const match = f.key.match(MEDIA_KEY_RE);
              const kind = match?.[2];
              const mediaId = match?.[3];
              return (
                <StorageFileRow
                  key={f.key}
                  objectKey={f.key}
                  name={f.key.split("/").pop() ?? f.key}
                  size={f.size}
                  lastModified={f.lastModified}
                  media={mediaId && kind ? { id: mediaId, kind } : null}
                />
              );
            })}
            {listing.folders.length === 0 && listing.files.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {listing.nextToken && (
        <Link
          href={`/staff/storage?prefix=${encodeURIComponent(prefix)}&cursor=${encodeURIComponent(listing.nextToken)}`}
          className="btn-subtle mt-3 inline-flex"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
