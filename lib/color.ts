// Shared by the three canvas-based editors (studio.tsx, slideshow-studio.tsx,
// thumbnail-studio.tsx) — each used to carry its own byte-identical copy of
// these two pure helpers.
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** hex ("#fff" or "#ffffff") + opacity 0-100 -> "rgba(r, g, b, a)". */
export function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16) || 0;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacityPercent, 0, 100) / 100})`;
}
