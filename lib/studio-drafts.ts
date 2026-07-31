// Saved Content Studio drafts — lets a user leave the wizard mid-edit and
// resume later, from any of the three starting points (Templates, Custom,
// or a copied IG/TikTok post).
import { randomBytes } from "node:crypto";
import { api } from "@/convex/_generated/api";
import { convexMutation, convexQuery } from "./db";

export type StudioDraftMode = "templates" | "custom" | "copy";

export type StudioDraftRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  template: string;
  mode: StudioDraftMode;
  source_platform: string | null;
  title: string;
  cover_image_url: string | null;
  state: string; // JSON
  /** "drafting" (or unset) is the normal editable state; "finished" is set by
   *  the studio's Finish button and locks the draft until explicitly edited. */
  status?: string;
  created_at: string;
  updated_at: string;
};

export async function listStudioDrafts(workspaceId: string): Promise<StudioDraftRow[]> {
  return await convexQuery<StudioDraftRow[]>(api.studioDrafts.listForWorkspace, {
    workspace_id: workspaceId,
  });
}

export async function saveStudioDraft(
  userId: string,
  workspaceId: string,
  input: {
    id?: string;
    template: string;
    mode: StudioDraftMode;
    source_platform?: string | null;
    title: string;
    cover_image_url?: string | null;
    state: unknown;
  }
): Promise<StudioDraftRow> {
  return await convexMutation<StudioDraftRow>(api.studioDrafts.upsert, {
    id: input.id ?? `sdraft_${randomBytes(8).toString("hex")}`,
    workspace_id: workspaceId,
    created_by: userId,
    template: input.template,
    mode: input.mode,
    source_platform: input.source_platform ?? null,
    title: input.title.trim() || "Untitled draft",
    cover_image_url: input.cover_image_url ?? null,
    state: JSON.stringify(input.state),
  });
}

export async function deleteStudioDraft(workspaceId: string, id: string): Promise<boolean> {
  return await convexMutation<boolean>(api.studioDrafts.remove, { id, workspace_id: workspaceId });
}

export async function setStudioDraftStatus(workspaceId: string, id: string, status: "drafting" | "finished"): Promise<StudioDraftRow | null> {
  return await convexMutation<StudioDraftRow | null>(api.studioDrafts.setStatus, { id, workspace_id: workspaceId, status });
}
