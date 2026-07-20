"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

export function SettingsTabs() {
  const path = usePathname();
  const active = path.endsWith("/queue")
    ? "queue"
    : path.endsWith("/workspace")
      ? "workspace"
      : path.endsWith("/billing")
        ? "billing"
        : path.endsWith("/plans")
          ? "plans"
          : "settings";
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "settings", label: "Settings", href: "/dashboard/settings" },
        { key: "queue", label: "Queue", href: "/dashboard/settings/queue" },
        { key: "workspace", label: "Workspace", href: "/dashboard/settings/workspace" },
        { key: "billing", label: "Billing", href: "/dashboard/settings/billing" },
        { key: "plans", label: "Plans", href: "/dashboard/settings/plans" },
      ]}
    />
  );
}
