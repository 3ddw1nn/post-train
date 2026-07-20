"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { Select } from "./interactive";
import { PaywallModal } from "./paywall-modal";

type DevState = {
  user: {
    email: string;
    is_staff: boolean;
    onboarded: boolean;
  };
  workspace: {
    name: string;
    role: string | null;
  };
  subscription: {
    plan: "none" | "creator" | "growth" | "pro";
    status: string;
    api_addon: boolean;
    interval: "month" | "year";
  };
};

const PLAN_OPTIONS = ["none", "creator", "growth", "pro"] as const;
const STATUS_OPTIONS = ["trialing", "active", "past_due", "canceled", "paused"] as const;
const ROLE_OPTIONS = ["owner", "admin", "member"] as const;

export function DevModeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [state, setState] = useState<DevState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/dev/dashboard-controls", { cache: "no-store" });
    if (!res.ok) {
      setError("Dev controls are not available.");
      return;
    }
    setState(await res.json());
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/dashboard-controls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Dev update failed.");
      setState(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev update failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open && !state) void load();
  }, [open, state]);

  return (
    <>
      <button
        type="button"
        className="btn-dark !px-2.5 !py-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Icon name="flask" size={13} /> Dev
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10"
          onClick={() => setOpen(false)}
        >
          <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-extrabold">Dev mode</p>
                <p className="text-sm text-muted">Temporary dashboard test controls.</p>
              </div>
              <button
                type="button"
                className="btn-subtle !px-2 !py-1.5"
                aria-label="Close dev mode"
                onClick={() => setOpen(false)}
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            {!state ? (
              <div className="mt-5 rounded-xl border border-line bg-page p-4 text-sm text-muted">
                Loading controls...
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-4">
                <div className="rounded-xl border border-line p-3">
                  <p className="text-xs font-bold uppercase text-muted">User</p>
                  <p className="mt-1 truncate text-sm font-semibold">{state.user.email}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <ToggleRow
                      label="Staff override"
                      checked={state.user.is_staff}
                      disabled={busy}
                      onChange={(checked) => patch({ is_staff: checked })}
                    />
                    <ToggleRow
                      label="Onboarded"
                      checked={state.user.onboarded}
                      disabled={busy}
                      onChange={(checked) => patch({ onboarded: checked })}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-line p-3">
                  <p className="text-xs font-bold uppercase text-muted">Subscription</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="text-sm font-semibold">
                      Plan
                      <Select
                        className="mt-1 !py-1.5"
                        value={state.subscription.plan}
                        disabled={busy}
                        onChange={(v) => patch({ plan: v })}
                        options={PLAN_OPTIONS.map((plan) => ({ value: plan, label: plan }))}
                      />
                    </div>
                    <div className="text-sm font-semibold">
                      Status
                      <Select
                        className="mt-1 !py-1.5"
                        value={
                          STATUS_OPTIONS.includes(state.subscription.status as never)
                            ? state.subscription.status
                            : "active"
                        }
                        disabled={busy || state.subscription.plan === "none"}
                        onChange={(v) =>
                          patch({
                            plan: state.subscription.plan === "none" ? "creator" : state.subscription.plan,
                            status: v,
                            api_addon: state.subscription.api_addon,
                            interval: state.subscription.interval,
                          })
                        }
                        options={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
                      />
                    </div>
                    <div className="text-sm font-semibold">
                      Interval
                      <Select
                        className="mt-1 !py-1.5"
                        value={state.subscription.interval}
                        disabled={busy || state.subscription.plan === "none"}
                        onChange={(v) =>
                          patch({
                            plan: state.subscription.plan === "none" ? "creator" : state.subscription.plan,
                            status: state.subscription.status === "none" ? "active" : state.subscription.status,
                            api_addon: state.subscription.api_addon,
                            interval: v,
                          })
                        }
                        options={[
                          { value: "month", label: "month" },
                          { value: "year", label: "year" },
                        ]}
                      />
                    </div>
                    <ToggleRow
                      label="API add-on"
                      checked={state.subscription.api_addon}
                      disabled={busy || state.subscription.plan === "none"}
                      onChange={(checked) => patch({ api_addon: checked })}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-line p-3">
                  <p className="text-xs font-bold uppercase text-muted">Workspace</p>
                  <p className="mt-1 truncate text-sm font-semibold">{state.workspace.name}</p>
                  <div className="mt-3 text-sm font-semibold">
                    Current role
                    <Select
                      className="mt-1 !py-1.5"
                      value={state.workspace.role ?? "member"}
                      disabled={busy}
                      onChange={(v) => patch({ workspace_role: v })}
                      options={ROLE_OPTIONS.map((role) => ({ value: role, label: role }))}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-warning"
                      onClick={() => {
                        localStorage.removeItem("pt_paywall_seen");
                        setPaywallOpen(true);
                      }}
                    >
                      Show paywall modal
                    </button>
                    <button
                      type="button"
                      className="btn-dark"
                      onClick={() => {
                        setOpen(false);
                        router.push("/onboarding/start");
                      }}
                    >
                      <Icon name="sparkles" size={14} /> Show onboarding wizard
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn-subtle"
                    disabled={busy}
                    onClick={() => {
                      setState(null);
                      void load();
                      router.refresh();
                    }}
                  >
                    <Icon name="refresh" size={14} /> Refresh state
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {paywallOpen && <PaywallModal onClose={() => setPaywallOpen(false)} />}
    </>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-page px-3 py-2 text-sm font-semibold">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="pt-toggle"
        data-on={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}
