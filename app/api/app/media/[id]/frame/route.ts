import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { assertFfmpeg, extractFrame } from "@/lib/ffmpeg";
import { readMediaBytes } from "@/lib/media";
import { currentWorkspace } from "@/lib/workspaces";

// A single still frame from a video, at ?t=<seconds> — the Thumbnail Maker
// tool's "grab a frame from the video" background source. Same shape and same
// on-demand/HTTP-cached-only tradeoff as the sibling filmstrip route; see its
// comment for why this has to happen server-side rather than in the browser.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const atSeconds = Number(url.searchParams.get("t"));
  if (!Number.isFinite(atSeconds) || atSeconds < 0) {
    return new Response("Missing or invalid t", { status: 400 });
  }

  const found = await readMediaBytes(id);
  if (!found || found.row.workspace_id !== ws.id) {
    return new Response("Not found", { status: 404 });
  }
  if (found.row.kind !== "video") {
    return new Response("Not a video", { status: 400 });
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "pt-frame-"));
  try {
    await assertFfmpeg();
    const source = path.join(dir, "in");
    const frame = path.join(dir, "frame.jpg");
    writeFileSync(source, found.bytes);
    await extractFrame(source, frame, atSeconds);
    return new Response(new Uint8Array(readFileSync(frame)), {
      headers: {
        "Content-Type": "image/jpeg",
        // Media bytes are immutable, so a given (id, t) pair never changes.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(`[frame] ${id}@${atSeconds}:`, error instanceof Error ? error.message : error);
    return new Response("Frame unavailable", { status: 404 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
