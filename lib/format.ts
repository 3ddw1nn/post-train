// Shared display formatters. relativeTime used to be copy-pasted across
// grid-studio.tsx, slideshow-studio.tsx, ai-ugc-studio.tsx, and studio.tsx
// (as `draftAge`) with three subtly different implementations — one rounded
// instead of floored (so "30s ago" prematurely read "1m ago"), one had no
// "days" bucket at all (a draft from 3 days ago read "72h ago" forever), and
// capitalization varied. This is the floor-based version (the more correct
// of the three — accurate at each boundary, defensive against a future
// timestamp) with the lowercase "just now" three of the four call sites
// already used.
export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
