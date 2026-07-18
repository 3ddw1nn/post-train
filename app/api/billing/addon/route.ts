import { requireUser } from "@/lib/auth";
import { getSubscription, setApiAddon } from "@/lib/billing";
import { entitled } from "@/lib/entitlements";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const on = !!body?.on;
  const sub = await getSubscription(user.id);
  if (on && !entitled(sub)) {
    return Response.json(
      { error: { message: "The API add-on requires an active subscription." } },
      { status: 400 }
    );
  }
  await setApiAddon(user.id, on, body?.interval === "month" ? "month" : "year");
  return Response.json({ ok: true });
}
