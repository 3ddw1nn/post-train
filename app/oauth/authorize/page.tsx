// The OAuth authorization endpoint, as a page — this is the consent screen a
// user sees when Claude (or any MCP client) asks to connect to their workspace.
//
// Everything security-relevant is validated here, before the user is shown an
// approve button, so a malformed or hostile request never reaches the point of
// minting a code. Errors split two ways on purpose (RFC 6749 §4.1.2.1): if we
// can't trust the redirect_uri we render the error, and only once it's verified
// against the client's registration do we redirect errors back to the client.
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { currentWorkspace } from "@/lib/workspaces";
import { getSubscription } from "@/lib/billing";
import { apiAccess } from "@/lib/entitlements";
import { findClient, mcpResourceUri, parseScope, redirectUriRegistered, SCOPES } from "@/lib/mcp-oauth";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Authorize access" };

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card p-6">
        <h1 className="text-lg font-bold text-danger">{title}</h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
        <p className="mt-4 text-xs text-muted">
          Nothing was connected. You can close this window and try again from the app that sent you here.
        </p>
      </div>
    </div>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);

  const clientId = str("client_id");
  const redirectUri = str("redirect_uri");
  const responseType = str("response_type");
  const codeChallenge = str("code_challenge");
  const codeChallengeMethod = str("code_challenge_method");
  const state = str("state");
  const resource = str("resource");

  if (!clientId || !redirectUri) {
    return <ErrorCard title="Invalid request" detail="This authorization link is missing its client_id or redirect_uri." />;
  }
  const client = await findClient(clientId);
  if (!client) {
    return <ErrorCard title="Unknown application" detail="The app that sent you here isn't registered with Post Train." />;
  }
  // Until this passes, redirectUri is attacker-controlled — never redirect to it.
  if (!redirectUriRegistered(client, redirectUri)) {
    return (
      <ErrorCard
        title="Redirect mismatch"
        detail={`${client.client_name} asked to be sent back to a URL it hasn't registered. This can happen after an app changes its setup — reconnect from the app to re-register it.`}
      />
    );
  }

  // From here the redirect target is trusted, so protocol errors go back to the
  // client the way its OAuth library expects rather than dead-ending in the browser.
  const bounce = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    redirect(url.toString());
  };

  if (responseType !== "code") bounce("unsupported_response_type", "Only response_type=code is supported.");
  if (!codeChallenge) bounce("invalid_request", "PKCE is required: send code_challenge.");
  if (codeChallengeMethod !== "S256") bounce("invalid_request", "code_challenge_method must be S256.");

  const user = await getSessionUser();
  if (!user) {
    // Bounce through sign-in and come straight back to this same consent URL.
    const self = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string") self.set(k, v);
    redirect(`/signin?return=${encodeURIComponent(`/oauth/authorize?${self}`)}`);
  }

  const sub = await getSubscription(user!.id);
  if (!apiAccess(sub)) {
    return (
      <ErrorCard
        title="Plan upgrade required"
        detail="API and MCP access is included with every paid Post Train plan. Upgrade your plan, then connect again."
      />
    );
  }

  const workspace = await currentWorkspace(user!);
  const scopes = parseScope(str("scope"));

  // RFC 8707: if the client names a resource, it must be the one we guard.
  // A token bound to someone else's resource must never be issued from here.
  const expectedResource = mcpResourceUri(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (resource && expectedResource && resource.replace(/\/$/, "") !== expectedResource.replace(/\/$/, "")) {
    bounce("invalid_target", "The requested resource is not served by this authorization server.");
  }

  return (
    <div className="mx-auto mt-16 max-w-md px-4">
      <div className="card p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Authorize access</p>
        <h1 className="mt-1 text-xl font-bold">
          {client.client_name} wants to access your Post Train workspace
        </h1>
        <p className="mt-2 text-sm text-muted">
          Signed in as <span className="font-semibold text-ink">{user!.email}</span> · workspace{" "}
          <span className="font-semibold text-ink">{workspace.name}</span>
        </p>

        <ul className="mt-4 flex flex-col gap-2 rounded-xl border border-line bg-page/50 p-3">
          {scopes.map((s) => (
            <li key={s} className="text-sm">
              <span className="font-semibold">{s === "read" ? "Read" : "Publish"}</span>
              <span className="text-muted"> — {SCOPES[s]}</span>
            </li>
          ))}
        </ul>

        <ConsentForm
          clientId={clientId}
          redirectUri={redirectUri}
          scope={scopes.join(" ")}
          state={state ?? ""}
          codeChallenge={codeChallenge!}
          resource={resource ?? ""}
          clientName={client.client_name}
        />

        <p className="mt-3 text-xs text-muted">
          You can disconnect this at any time from Settings → API &amp; MCP. Approving does not give{" "}
          {client.client_name} your password or your connected social account credentials.
        </p>
      </div>
    </div>
  );
}
