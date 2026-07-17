import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fade-up mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="mt-4">
        <SettingsTabs />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
