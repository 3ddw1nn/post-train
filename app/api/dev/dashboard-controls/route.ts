import { requireUser } from "@/lib/auth";
import { getSubscription, type Plan, type Subscription } from "@/lib/billing";
import { convexMutation, deleteRecords, findRecord, now, patchRecord, patchRecords, uid } from "@/lib/db";
import { currentWorkspace } from "@/lib/workspaces";
import { api } from "@/convex/_generated/api";

const DEV_ONLY = process.env.NODE_ENV !== "production";
const PLANS = ["none", "creator", "growth", "pro"] as const;
const STATUSES = ["trialing", "active", "past_due", "canceled", "paused"] as const;
const ROLES = ["owner", "admin", "member"] as const;

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

function disabled() {
  return Response.json({ error: { message: "Dev controls are disabled in production." } }, { status: 404 });
}

async function state() {
  const user = await requireUser();
  const ws = await currentWorkspace(user);
  const sub = await getSubscription(user.id);
  const member = await findRecord<{ role: string }>("workspace_members", {
    workspace_id: ws.id,
    user_id: user.id,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      is_staff: !!user.is_staff,
      onboarded: !!user.onboarded_at,
    },
    workspace: {
      id: ws.id,
      name: ws.name,
      role: member?.role ?? null,
    },
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          api_addon: !!sub.api_addon,
          interval: sub.interval,
        }
      : {
          plan: "none",
          status: "none",
          api_addon: false,
          interval: "month",
        },
  };
}

export async function GET() {
  if (!DEV_ONLY) return disabled();
  return Response.json(await state());
}

export async function PATCH(req: Request) {
  if (!DEV_ONLY) return disabled();
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));

  if (typeof body.is_staff === "boolean") {
    await patchRecord("users", user.id, { is_staff: body.is_staff ? 1 : 0 });
  }

  if (typeof body.onboarded === "boolean") {
    await patchRecord("users", user.id, { onboarded_at: body.onboarded ? now() : null });
  }

  if (isOneOf(body.plan, PLANS)) {
    if (body.plan === "none") {
      await deleteRecords("subscriptions", { user_id: user.id });
    } else {
      const existing = await getSubscription(user.id);
      const status = isOneOf(body.status, STATUSES) ? body.status : "active";
      await convexMutation<Subscription>(api.billing.upsertSubscription, {
        id: existing?.id && existing.id !== "staff-override" ? existing.id : `dev-${uid()}`,
        user_id: user.id,
        plan: body.plan as Exclude<Plan, "free">,
        interval: body.interval === "year" ? "year" : "month",
        status,
        cancel_at_period_end: 0,
        trial_ends_at:
          status === "trialing"
            ? new Date(Date.now() + 7 * 86400_000).toISOString()
            : null,
        current_period_end:
          status === "active"
            ? new Date(Date.now() + 30 * 86400_000).toISOString()
            : null,
        api_addon: body.api_addon ? 1 : 0,
        api_addon_interval: body.api_addon ? body.interval === "year" ? "year" : "month" : null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      });
    }
  } else if (typeof body.api_addon === "boolean") {
    const existing = await getSubscription(user.id);
    if (existing && existing.id !== "staff-override") {
      await convexMutation(api.billing.patchByUser, {
        user_id: user.id,
        patch: {
          api_addon: body.api_addon ? 1 : 0,
          api_addon_interval: body.api_addon ? existing.interval : null,
          updated_at: now(),
        },
      });
    }
  }

  if (isOneOf(body.workspace_role, ROLES)) {
    const ws = await currentWorkspace(user);
    await patchRecords(
      "workspace_members",
      { workspace_id: ws.id, user_id: user.id },
      { role: body.workspace_role }
    );
    if (body.workspace_role === "owner") {
      await patchRecord("workspaces", ws.id, { owner_id: user.id });
    }
  }

  return Response.json(await state());
}
