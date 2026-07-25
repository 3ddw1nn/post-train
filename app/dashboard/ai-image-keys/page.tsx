import { requireOnboardedUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { studioAccess } from "@/lib/entitlements";
import { listImageGenKeys, PROVIDERS } from "@/lib/image-gen-keys";
import { AiImageKeysPanel } from "./ai-image-keys-panel";

export const metadata = { title: "AI Image Keys" };

export default async function AiImageKeysPage() {
  const user = await requireOnboardedUser();
  const ws = await currentWorkspace(user);
  const sub = await getSubscription(user.id);
  const hasAccess = studioAccess(sub);
  const keys = await listImageGenKeys(ws.id);

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <AiImageKeysPanel
        hasAccess={hasAccess}
        keys={keys.map((k) => ({ id: k.id, provider: k.provider, last4: k.last4, created_at: k.created_at }))}
        providers={PROVIDERS.map((p) => ({ id: p.id, label: p.label, consoleUrl: p.consoleUrl }))}
      />
    </div>
  );
}
