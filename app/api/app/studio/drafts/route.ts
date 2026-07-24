import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { jsonError } from "@/lib/api-auth";
import { DomainError } from "@/lib/posts";
import { listStudioDrafts, saveStudioDraft, type StudioDraftMode } from "@/lib/studio-drafts";

const DRAFT_MODES: StudioDraftMode[] = ["templates", "custom", "copy"];

export async function GET() {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    const drafts = await listStudioDrafts(ws.id);
    return Response.json({ data: drafts });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    const body = await req.json().catch(() => ({}));
    const { id, template, mode, source_platform, title, cover_image_url, state } = body ?? {};
    if (typeof template !== "string" || !template.trim()) {
      throw new DomainError(400, "A template is required.");
    }
    if (!DRAFT_MODES.includes(mode)) {
      throw new DomainError(400, "Invalid draft mode.");
    }
    if (state === undefined) {
      throw new DomainError(400, "Draft state is required.");
    }
    const draft = await saveStudioDraft(user.id, ws.id, {
      id: typeof id === "string" ? id : undefined,
      template,
      mode,
      source_platform: typeof source_platform === "string" ? source_platform : null,
      title: typeof title === "string" ? title : "",
      cover_image_url: typeof cover_image_url === "string" ? cover_image_url : null,
      state,
    });
    return Response.json(draft, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
