import { requireUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { canManageWorkspace } from "@/lib/permissions";
import { saveImageGenKey, deleteImageGenKey } from "@/lib/image-gen-keys";
import { jsonError } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const sub = await getSubscription(user.id);
    if (!studioAccess(sub)) {
      return Response.json(
        { error: { message: "Content Studio requires a paid plan." } },
        { status: 403 }
      );
    }
    const ws = await currentWorkspace(user);
    if (!(await canManageWorkspace(ws.id, user.id))) {
      return Response.json(
        { error: { message: "Only workspace owners and admins can add AI image keys." } },
        { status: 403 }
      );
    }
    const body = await req.json().catch(() => null);
    await saveImageGenKey(ws.id, String(body?.provider ?? ""), String(body?.apiKey ?? ""));
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const ws = await currentWorkspace(user);
    if (!(await canManageWorkspace(ws.id, user.id))) {
      return Response.json(
        { error: { message: "Only workspace owners and admins can remove AI image keys." } },
        { status: 403 }
      );
    }
    const body = await req.json().catch(() => null);
    await deleteImageGenKey(ws.id, String(body?.id ?? ""));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
