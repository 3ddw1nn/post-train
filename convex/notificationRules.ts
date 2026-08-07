// The lifecycle rule behind the notification inbox, as a pure function so it
// can be checked without a database — see `npm run check:notifications`.
//
// Convex mutations own the writing; this owns the decision. The two bugs it
// exists to prevent are both silent:
//   1. A render that goes rendering → ready leaving TWO inbox entries.
//   2. The 15s worker re-tick re-toasting an unchanged state forever.

export type NotificationContent = {
  status: string;
  title: string;
  message: string;
  href: string | null;
};

export type ExistingNotification = NotificationContent & {
  read_at: string | null;
  toast_shown_at: string | null;
};

export type NotificationDecision =
  | { action: "insert"; content: NotificationContent }
  | { action: "skip" }
  | {
      action: "patch";
      /** Cleared so the update surfaces again — "your render finished" is
       *  worth a second toast even if you dismissed "your render started". */
      patch: NotificationContent & { read_at: null; toast_shown_at: null };
    };

/**
 * What to do with an incoming notification for a given dedupe key.
 *
 * `href` deliberately does NOT count as a change: a producer re-pointing a
 * link is not news, and treating it as news would re-toast on every tick.
 */
export function decideNotification(
  existing: ExistingNotification | null | undefined,
  incoming: NotificationContent,
): NotificationDecision {
  if (!existing) return { action: "insert", content: incoming };
  const changed =
    existing.status !== incoming.status ||
    existing.title !== incoming.title ||
    existing.message !== incoming.message;
  if (!changed) return { action: "skip" };
  return { action: "patch", patch: { ...incoming, read_at: null, toast_shown_at: null } };
}
