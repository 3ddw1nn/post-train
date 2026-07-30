import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { assertFfmpeg, renderFilmstrip } from "@/lib/ffmpeg";
import { readMediaBytes } from "@/lib/media";
import { currentWorkspace } from "@/lib/workspaces";

// Timeline thumbnails for a video: one same-origin JPEG holding six square
// frames side by side, which the editor tiles across each clip block.
// ponytail: rendered on demand and cached only by the client's HTTP cache, so a
// cold cache costs one ffmpeg run per clip. Upgrade path is generating the
// strip once at upload time and storing it as a media row.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const { id } = await ctx.params;

  const found = await readMediaBytes(id);
  if (!found || found.row.workspace_id !== ws.id) {
    return new Response("Not found", { status: 404 });
  }
  if (found.row.kind !== "video") {
    return new Response("Not a video", { status: 400 });
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "pt-filmstrip-"));
  try {
    await assertFfmpeg();
    const source = path.join(dir, "in");
    const strip = path.join(dir, "strip.jpg");
    writeFileSync(source, found.bytes);
    await renderFilmstrip(source, strip);
    return new Response(new Uint8Array(readFileSync(strip)), {
      headers: {
        "Content-Type": "image/jpeg",
        // Media ids are immutable, so the strip for one can never change.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    // A missing ffmpeg or an unreadable file just means no thumbnails; the
    // editor falls back to plain clip blocks. Logged rather than swallowed —
    // a bare 404 here previously left no trace to debug a broken pipeline.
    console.error(`[filmstrip] ${id}:`, error instanceof Error ? error.message : error);
    return new Response("Filmstrip unavailable", { status: 404 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
