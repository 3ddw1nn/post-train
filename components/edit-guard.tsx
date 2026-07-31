"use client";

// Guards a finished studio draft against silent edits — nothing is locked or
// greyed out; the draft stays fully visible and browsable. The moment an
// actual edit is attempted (typing, dragging, clicking a control) inside the
// guarded region, the interaction is swallowed in the capture phase — before
// it can change any state — and a confirm dialog takes over. Confirming
// flips the draft back to "drafting" and lets the same interaction go through
// normally from then on; cancelling leaves everything exactly as it was,
// since the original event never reached its handler.
//
// Elements marked data-edit-guard-exempt (step navigation, Back, the
// Finish/Publish footer) and native <video>/<audio> controls are never
// intercepted — those aren't edits.
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

function isExempt(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-edit-guard-exempt]")) return true;
  const tag = target.tagName;
  return tag === "VIDEO" || tag === "AUDIO";
}

function ConfirmEditDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div data-edit-guard-exempt className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm p-5" onClick={(event) => event.stopPropagation()}>
        <p className="text-lg font-extrabold">Edit this finished video?</p>
        <p className="mt-2 text-sm text-muted">It&rsquo;ll move back to Drafts until you finish it again. The version already in your Library won&rsquo;t be affected.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-subtle" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onConfirm}>Edit</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useEditGuard(finished: boolean, onUnlock: () => void) {
  const [confirming, setConfirming] = useState(false);
  function guard(event: React.SyntheticEvent) {
    if (!finished || isExempt(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    setConfirming(true);
  }
  const dialog = confirming ? (
    <ConfirmEditDialog
      onCancel={() => setConfirming(false)}
      onConfirm={() => {
        setConfirming(false);
        onUnlock();
      }}
    />
  ) : null;
  return { guard, dialog };
}
