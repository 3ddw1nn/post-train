"use client";

import { useState } from "react";

/**
 * Approve/deny buttons. Both post to the same endpoint so a denial is recorded
 * as a proper OAuth error redirect rather than the user closing the tab and the
 * client hanging.
 */
export function ConsentForm(props: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  resource: string;
  clientName: string;
}) {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  return (
    <form method="POST" action="/api/oauth/mcp/approve" className="mt-5 flex flex-col gap-2">
      <input type="hidden" name="client_id" value={props.clientId} />
      <input type="hidden" name="redirect_uri" value={props.redirectUri} />
      <input type="hidden" name="scope" value={props.scope} />
      <input type="hidden" name="state" value={props.state} />
      <input type="hidden" name="code_challenge" value={props.codeChallenge} />
      <input type="hidden" name="resource" value={props.resource} />

      <button
        type="submit"
        name="decision"
        value="approve"
        disabled={busy !== null}
        onClick={() => setBusy("approve")}
        className="btn-dark w-full justify-center disabled:opacity-60"
      >
        {busy === "approve" ? "Connecting…" : `Allow ${props.clientName}`}
      </button>
      <button
        type="submit"
        name="decision"
        value="deny"
        disabled={busy !== null}
        onClick={() => setBusy("deny")}
        className="btn w-full justify-center border border-line hover:bg-page disabled:opacity-60"
      >
        Cancel
      </button>
    </form>
  );
}
