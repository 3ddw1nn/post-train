"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { PlanPicker } from "./plan-picker";

export function PaywallModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="card relative overflow-hidden p-6 sm:p-10">
          <button
            type="button"
            aria-label="Explore first"
            className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-muted shadow-sm transition-colors hover:bg-page hover:text-ink"
            onClick={onClose}
          >
            Explore first <Icon name="x" size={18} />
          </button>
          <div className="mx-auto max-w-lg text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">Unlock the full ride</h2>
            <p className="mt-2 text-muted">
              You&apos;re previewing Post Train right now. Start a trial to connect more
              accounts, schedule posts, and track what&apos;s working.
            </p>
          </div>
          <div className="mt-8">
            <PlanPicker mode="checkout" />
          </div>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(modal, document.body) : null;
}
